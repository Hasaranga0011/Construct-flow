import React, { useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { ModalViewport } from './ModalViewport';

type Props = { value: string; onChange: (value: string) => void; label: string; mode?: 'date' | 'time' };
export function DateField({ value, onChange, label, mode = 'date' }: Props) {
  const [open, setOpen] = useState(false);
  const parsed = mode === 'time' ? new Date(`2000-01-01T${value || '08:00'}:00`) : new Date(`${value}T12:00:00`);
  const date = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  const change = (event: DateTimePickerEvent, selected?: Date) => {
    if (Platform.OS === 'android') setOpen(false);
    if (event.type !== 'set' || !selected) return;
    const pad = (v: number) => String(v).padStart(2, '0');
    onChange(mode === 'time' ? `${pad(selected.getHours())}:${pad(selected.getMinutes())}` : `${selected.getFullYear()}-${pad(selected.getMonth() + 1)}-${pad(selected.getDate())}`);
  };
  const picker = <DateTimePicker value={date} mode={mode} display={Platform.OS === 'ios' ? 'inline' : 'default'} onChange={change} style={{ width: '100%' }} />;
  return <>
    <Pressable accessibilityLabel={label} accessibilityRole="button" onPress={() => setOpen(true)} className="w-full min-h-[48px] rounded-lg border border-gray-300 bg-gray-50 p-4">
      <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-brand-text">{value || (mode === 'date' ? 'Select date' : 'Select time')}</Text>
    </Pressable>
    {open && (Platform.OS === 'android' ? picker : <Modal transparent visible onRequestClose={() => setOpen(false)}><ModalViewport>
      <View className="w-full max-w-[448px] rounded-lg bg-white p-4 flex-shrink">
        <ScrollView keyboardShouldPersistTaps="handled"><Text style={{ flexShrink: 1, minWidth: 0 }} className="font-bold mb-4">{label}</Text>{picker}</ScrollView>
        <Pressable onPress={() => setOpen(false)} className="min-h-[44px] items-center justify-center rounded-lg bg-brand-orange mt-4"><Text style={{ flexShrink: 1, minWidth: 0 }} className="font-semibold text-white">Done</Text></Pressable>
      </View>
    </ModalViewport></Modal>)}
  </>;
}
