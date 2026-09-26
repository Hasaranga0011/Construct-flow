import React, { useEffect, useState } from 'react';
import { Alert, Modal, Pressable, Text, View } from 'react-native';

type MessageButton = {
  text: string;
  style?: 'cancel' | 'destructive' | 'default';
  onPress?: () => void;
};

type MessageState = {
  title: string;
  message?: string;
  buttons: MessageButton[];
};

export const AppMessageProvider = () => {
  const [message, setMessage] = useState<MessageState | null>(null);

  useEffect(() => {
    const nativeAlert = Alert.alert;
    const browserAlert = typeof window !== 'undefined' ? window.alert : null;
    const globalAlert = globalThis.alert;
    const showSingleMessage = (text?: string) => {
      setMessage({ title: 'Message', message: text || '', buttons: [{ text: 'OK' }] });
    };

    Alert.alert = ((title: string, messageText?: string, buttons?: MessageButton[]) => {
      setMessage({
        title,
        message: messageText,
        buttons: buttons?.length ? buttons : [{ text: 'OK' }],
      });
    }) as typeof Alert.alert;

    if (typeof window !== 'undefined') {
      window.alert = showSingleMessage;
    }
    globalThis.alert = showSingleMessage;

    return () => {
      Alert.alert = nativeAlert;
      if (typeof window !== 'undefined' && browserAlert) window.alert = browserAlert;
      globalThis.alert = globalAlert;
    };
  }, []);

  if (!message) return null;

  const closeWith = (button: MessageButton) => {
    setMessage(null);
    button.onPress?.();
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => setMessage(null)}>
      <View className="flex-1 items-center justify-center bg-black/50 px-6">
        <View className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
          <Text className="text-xl font-bold text-gray-900">{message.title}</Text>
          {!!message.message && <Text className="mt-2 text-sm leading-5 text-gray-500">{message.message}</Text>}
          <View className="mt-6 flex-row justify-end gap-3">
            {message.buttons.map((button, index) => (
              <Pressable
                key={`${button.text}-${index}`}
                onPress={() => closeWith(button)}
                className={`rounded-lg px-4 py-3 ${button.style === 'destructive' ? 'bg-red-500' : index === message.buttons.length - 1 ? 'bg-brand-orange' : 'border border-gray-200'}`}
              >
                <Text className={`font-semibold ${button.style === 'destructive' || index === message.buttons.length - 1 ? 'text-white' : 'text-gray-700'}`}>
                  {button.text}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      </View>
    </Modal>
  );
};
