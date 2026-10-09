import { useState, useEffect, useRef, useCallback } from 'react';
import { Platform } from 'react-native';
import * as Device from 'expo-device';
import Constants, { ExecutionEnvironment } from 'expo-constants';

import { supabase } from '../lib/supabase';

const supportsRemotePush = Platform.OS !== 'web' && Constants.executionEnvironment !== ExecutionEnvironment.StoreClient;
// Avoid loading token auto-registration side effects in Expo Go and web.
const Notifications: typeof import('expo-notifications') | null = supportsRemotePush ? require('expo-notifications') : null;

if (Notifications) Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export function usePushNotifications(userId: string | null) {
  const [expoPushToken, setExpoPushToken] = useState<string | null>(null);
  const notificationListener = useRef<any>(null);
  const responseListener = useRef<any>(null);

  const requestToken = useCallback(async () => {
    if (!userId || !Notifications) return null;
    const token = await registerForPushNotificationsAsync();
    if (token) {
      const { error } = await supabase.from('profiles').update({ expo_push_token: token }).eq('id', userId);
      if (error) throw error;
      setExpoPushToken(token);
    }
    return token ?? null;
  }, [userId]);

  useEffect(() => {
    if (!userId || !Notifications) return;

    registerForPushNotificationsAsync()
      .then(async (token) => {
        if (token) {
          setExpoPushToken(token);
          // Save token to Supabase profiles
          await supabase
            .from('profiles')
            .update({ expo_push_token: token })
            .eq('id', userId);
        }
      })
      .catch((error) => console.log('Error registering for push notifications:', error));

    notificationListener.current = Notifications.addNotificationReceivedListener(notification => {
      console.log('Received notification:', notification);
    });

    responseListener.current = Notifications.addNotificationResponseReceivedListener(response => {
      console.log('User interacted with notification:', response);
    });

    return () => {
      if (notificationListener.current) {
        notificationListener.current.remove();
      }
      if (responseListener.current) {
        responseListener.current.remove();
      }
    };
  }, [userId]);

  return { expoPushToken, requestToken };
}

async function registerForPushNotificationsAsync() {
  if (!Notifications) return null;
  let token;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#F97316',
    });
  }

  if (Device.isDevice) {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    
    if (finalStatus !== 'granted') {
      console.log('Failed to get push token for push notification!');
      return null;
    }
    
    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    if (!projectId) {
      console.log('No projectId found in app.json. Skipping push token generation.');
      return null;
    }
    token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  } else {
    console.log('Must use physical device for Push Notifications');
  }

  return token;
}
