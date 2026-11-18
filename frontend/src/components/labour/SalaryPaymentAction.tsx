import React, { useState } from 'react';
import { View, Text } from 'react-native';
import { Button, FormField, InlineNotice } from '@/components/ui';
import { api } from '@/services/api';
import { formatCurrencyExact } from '@/utils/format';

export function SalaryPaymentAction({ slip, onPaid }: { slip: { id: string; project_id?: string | null; status?: string | null; total_amount?: number | null; total_pay?: number | null }; onPaid: () => void }) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const total = slip.total_amount ?? slip.total_pay;
  if (!slip.project_id || slip.status === 'Paid' || total == null) return null;
  const save = async () => {
    if (busy) return;
    if (!amount.trim() || !Number.isFinite(Number(amount)) || Number(amount) !== Number(total)) {
      setError('Enter the exact salary amount to confirm payment.'); return;
    }
    setBusy(true); setError('');
    try { await api.patch(`/labour/salary/${slip.id}/paid`, { amount: Number(amount) }); setOpen(false); onPaid(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Payment was not recorded.'); }
    finally { setBusy(false); }
  };
  return <View className="mt-4">
    {!open ? <Button label="Record salary payment" variant="secondary" onPress={() => { setOpen(true); setAmount(''); setError(''); }} /> : <View className="gap-3">
      <Text className="text-sm text-slate-600">Only record this after paying the worker {formatCurrencyExact(Number(total))}. This updates the project ledger.</Text>
      <FormField label="Confirm amount paid" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" editable={!busy} />
      <InlineNotice message={error} />
      <Button label="Confirm salary paid" loading={busy} onPress={save} />
      <Button label="Cancel" variant="ghost" disabled={busy} onPress={() => setOpen(false)} />
    </View>}
  </View>;
}
