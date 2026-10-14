import { Alert } from 'react-native';

export function notify(title: string, message: string) {
  Alert.alert(title, message, [{ text: 'OK' }]);
}

export function confirmAction(title: string, message: string, destructive = true): Promise<boolean> {
  return new Promise(resolve => {
    Alert.alert(
      title,
      message,
      [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
        {
          text: 'Confirm',
          style: destructive ? 'destructive' : 'default',
          onPress: () => resolve(true),
        },
      ]
    );
  });
}

