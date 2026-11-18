import React from 'react';
import { Modal, View, Text, ScrollView } from 'react-native';
import { ModalViewport } from '../common/ModalViewport';
import { Button } from './Button';

export function FormModal({ visible, title, children, onClose, onSubmit, submitLabel = 'Save', busy = false }: {
  visible: boolean; title: string; children: React.ReactNode; onClose: () => void;
  onSubmit: () => void; submitLabel?: string; busy?: boolean;
}) {
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={() => { if (!busy) onClose(); }}>
    <ModalViewport><View accessibilityViewIsModal className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-xl border border-gray-200 dark:border-slate-700" style={{ flexShrink: 1, minHeight: 0 }}>
      <View className="p-5 border-b border-gray-100 dark:border-slate-800"><Text accessibilityRole="header" className="text-xl font-bold text-brand-text dark:text-white">{title}</Text></View>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 20 }} style={{ flexShrink: 1, minHeight: 0 }}>{children}</ScrollView>
      <View className="p-5 border-t border-gray-100 dark:border-slate-800 flex-row flex-wrap gap-3 justify-end">
        <Button label="Cancel" variant="secondary" onPress={onClose} disabled={busy} />
        <Button label={submitLabel} onPress={onSubmit} loading={busy} />
      </View>
    </View></ModalViewport>
  </Modal>;
}
