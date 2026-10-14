import { ModalViewport } from './ModalViewport';
import React, { useEffect, useState } from 'react';
import { Alert, Modal, Pressable, Text, View, ScrollView } from 'react-native';

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
      <ModalViewport>
        <ScrollView keyboardShouldPersistTaps="handled" style={{ flexGrow: 0, flexShrink: 1 }} contentContainerStyle={{ padding: 24 }} className="w-full max-w-sm max-h-full rounded-2xl bg-white shadow-2xl border border-gray-100">
          <View className="mb-4 h-12 w-12 items-center justify-center rounded-full bg-orange-100">
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xl font-bold text-brand-orange">!</Text>
          </View>
          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xl font-bold text-gray-900">{message.title}</Text>
          {!!message.message && <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="mt-2 text-sm leading-5 text-gray-600">{message.message}</Text>}
          <View className="mt-6 flex-row flex-wrap justify-end gap-3">
            {message.buttons.map((button, index) => {
              const isDestructive = button.style === 'destructive';
              const isCancel = button.style === 'cancel';
              const isPrimary = !isCancel && (index === message.buttons.length - 1 || message.buttons.length === 1);

              let btnBg = 'bg-brand-orange';
              let textCls = 'text-white';
              if (isDestructive) {
                btnBg = 'bg-red-500';
                textCls = 'text-white';
              } else if (isCancel) {
                btnBg = 'border border-gray-200 bg-white';
                textCls = 'text-gray-700';
              } else if (!isPrimary) {
                btnBg = 'border border-gray-200 bg-gray-50';
                textCls = 'text-gray-700';
              }

              return (
                <Pressable
                  style={{ minHeight: 44, minWidth: 44 }}
                  key={`${button.text}-${index}`}
                  onPress={() => closeWith(button)}
                  className={`rounded-xl px-5 py-3 items-center justify-center ${btnBg}`}
                >
                  <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className={`font-semibold ${textCls}`}>
                    {button.text}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>
      </ModalViewport>
    </Modal>
  );
};
