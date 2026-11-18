import React, { useRef, useState } from 'react';
import { View, Text } from 'react-native';
import { Button, FormField, InlineNotice } from '@/components/ui';
import { api } from '@/services/api';

const receiptId = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
  const n = Math.floor(Math.random() * 16); return (c === 'x' ? n : (n & 3) | 8).toString(16);
});

export function GoodsReceiptForm({ order, onReceived }: {
  order: { id: string; quantity_ordered: number; quantity_received?: number | null };
  onReceived: () => void | Promise<void>;
}) {
  const [quantity, setQuantity] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [success, setSuccess] = useState(false);
  const requestId = useRef(receiptId());
  const pending = useRef<{ receipt_id: string; quantity: number; note: string } | null>(null);
  const remaining = Number(order.quantity_ordered) - Number(order.quantity_received || 0);
  const submit = async () => {
    const count = Number(quantity);
    if (!pending.current && (!quantity.trim() || !Number.isFinite(count) || count <= 0 || count > remaining)) {
      setMessage(`Enter the quantity actually accepted, up to ${remaining}.`); return;
    }
    if (busy) return;
    setBusy(true); setMessage(''); setSuccess(false);
    // Retry the exact same receipt after a lost response; do not change its payload.
    pending.current ||= { receipt_id: requestId.current, quantity: count, note };
    try {
      await api.patch(`/purchase-orders/${order.id}/receive`, pending.current);
      requestId.current = receiptId(); pending.current = null;
      setQuantity(''); setNote(''); setSuccess(true); setMessage('Accepted quantity recorded in stock.');
      await onReceived();
    } catch (e) { setMessage(e instanceof Error ? e.message : 'Receipt failed'); }
    finally { setBusy(false); }
  };
  return <View className="w-full bg-green-50 border border-green-200 rounded-xl p-4 mt-3">
    <Text className="font-semibold text-green-950 mb-1">Confirm goods received · {remaining} outstanding</Text>
    <Text className="text-sm text-green-900 mb-4">Count accepted items; exclude missing or damaged items.</Text>
    <FormField label="Quantity actually received" value={quantity} onChangeText={setQuantity} editable={!busy && !pending.current} placeholder="Accepted quantity" keyboardType="decimal-pad" />
    <FormField label="Delivery receipt note" value={note} onChangeText={setNote} editable={!busy && !pending.current} placeholder="Delivery note or damage details" multiline style={{ minHeight: 80 }} maxLength={2000} />
    <Button label={pending.current ? 'Retry this receipt' : 'Confirm accepted quantity'} loading={busy} onPress={() => void submit()} />
    <View className="mt-3"><InlineNotice message={message} tone={success ? 'success' : 'error'} /></View>
  </View>;
}
