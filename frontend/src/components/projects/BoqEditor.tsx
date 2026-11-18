import React, { useState } from 'react';
import { View, Text } from 'react-native';
import { Button, FormField, FormModal, InlineNotice, Select } from '@/components/ui';
import { formatCurrencyExact as formatMoney } from '@/utils/format';

export function BoqEditor({ value, onChange, workers = [] }: { value: any; onChange: (value: any) => void; workers?: { id: string; name: string }[] }) {
  const [group, setGroup] = useState('items');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState<{ index: number; row: any } | null>(null);
  const [error, setError] = useState('');
  const rows: any[] = value?.[group] || [];
  const isWorkerRate = group === 'labour_overrides';
  const isRate = group === 'labour_rates' || isWorkerRate;
  const nameField = group === 'items' ? 'description' : group === 'materials' ? 'name' : isWorkerRate ? 'worker_id' : 'trade';
  const quantityField = group === 'materials' ? 'allocated_quantity' : 'quantity';
  const rateField = group === 'materials' ? 'unit_price' : isRate ? 'daily_rate' : 'rate';
  const matches = rows.map((row, index) => ({ row, index })).filter(({ row }) => String(row[nameField] || row.role || '').toLowerCase().includes(query.toLowerCase()));
  const save = () => {
    if (!editing) return;
    const row = { ...editing.row };
    if (!String(row[nameField] || '').trim()) { setError('Enter the item name.'); return; }
    for (const field of isRate ? [rateField] : [quantityField, rateField]) {
      if (String(row[field] ?? '').trim() === '' || !Number.isFinite(Number(row[field])) || Number(row[field]) < 0) { setError('Enter finite, nonnegative quantities and rates.'); return; }
      row[field] = Number(row[field]);
    }
    if (group === 'items') {
      if (!Number.isFinite(Number(row.amount)) || Number(row.amount) < 0) { setError('Enter a valid item amount.'); return; }
      row.amount = Number(row.amount);
    }
    const nextRows = [...rows];
    if (editing.index < 0) nextRows.push(row); else nextRows[editing.index] = row;
    const next = { ...value, [group]: nextRows };
    if (group === 'items') { next.total_budget = nextRows.reduce((sum, item) => sum + Number(item.amount || 0), 0); next.items_count = Math.max(Number(value.items_count || 0), nextRows.length); }
    onChange(next); setEditing(null);
  };
  const field = (label: string, key: string, numeric = false) => <FormField label={label} value={String(editing?.row[key] ?? '')} keyboardType={numeric ? 'decimal-pad' : 'default'} onChangeText={text => setEditing(old => old ? { ...old, row: { ...old.row, [key]: text } } : old)} />;
  return <View className="gap-4 mt-4">
    <Text className="font-semibold text-brand-text dark:text-white">Editable BOQ details</Text>
    <Select value={group} onValueChange={next => { setGroup(next); setPage(0); setQuery(''); }} options={[{ value: 'items', label: 'Work items & phases' }, { value: 'materials', label: 'Material quantities & rates' }, { value: 'labour_rates', label: 'Labour trade daily rates' }, ...(workers.length ? [{ value: 'labour_overrides', label: 'Agreed project worker rates' }] : [])]} />
    <Text className="text-sm text-slate-500">Work-item amounts determine the BOQ total. Material and labour sheets are planning references, not additional charges. Lump-sum amounts remain editable. Check extracted material quantities and units against your source BOQ before ordering.</Text>
    <FormField label="Search BOQ items" value={query} onChangeText={text => { setQuery(text); setPage(0); }} />
    {matches.slice(page * 15, page * 15 + 15).map(({ row, index }) => <View key={row.id || index} className="border border-slate-200 dark:border-slate-700 rounded-xl p-4 gap-2">
      <Text className="font-semibold text-brand-text dark:text-white">{isWorkerRate ? workers.find(worker => worker.id === row.worker_id)?.name || 'Previously assigned worker' : row[nameField] || row.role}</Text>
      <Text className="text-sm text-slate-500">{row.stage || row.unit || 'Daily rate'} · {isRate ? formatMoney(Number(row.daily_rate || 0)) : `${row[quantityField] || 0} ${row.unit || 'units'} × ${formatMoney(Number(row[rateField] || 0))}`}</Text>
      <Button label="Edit BOQ item" variant="secondary" size="compact" onPress={() => { setError(''); setEditing({ index, row: { ...row, trade: row.trade || row.role } }); }} />
    </View>)}
    <View className="flex-row flex-wrap gap-3">
      <Button label="Add BOQ item" size="compact" onPress={() => { setError(''); setEditing({ index: -1, row: { [nameField]: '', [quantityField]: 0, [rateField]: 0, amount: 0, unit: group === 'labour_rates' ? 'day' : 'units', stage: 'General' } }); }} />
      {page > 0 && <Button label="Previous items" variant="ghost" onPress={() => setPage(page - 1)} />}
      {(page + 1) * 15 < matches.length && <Button label="Next items" variant="ghost" onPress={() => setPage(page + 1)} />}
    </View>
    <FormModal visible={!!editing} title="Edit BOQ item" onClose={() => setEditing(null)} onSubmit={save} submitLabel="Keep item changes">
      <InlineNotice message={error} />
      {isWorkerRate ? <Select value={editing?.row.worker_id || ''} onValueChange={id => setEditing(old => old ? { ...old, row: { ...old.row, worker_id: id } } : old)} options={workers.map(worker => ({ value: worker.id, label: worker.name }))} placeholder="Choose an assigned worker" /> : field('Description / name', nameField)}
      {!isWorkerRate && field('Unit', 'unit')}
      {!isRate && field('Planned quantity', quantityField, true)}
      {field(isRate ? 'Daily rate' : 'Unit rate', rateField, true)}
      {group === 'labour_rates' && field('Overtime hourly rate (0 uses standard 1.5× rule)', 'ot_rate', true)}
      {group === 'items' && <>{field('Phase', 'stage')}{field('Amount (including lump sums)', 'amount', true)}<Button label="Calculate quantity × rate" variant="ghost" onPress={() => setEditing(old => old ? { ...old, row: { ...old.row, amount: Math.round(Number(old.row.quantity) * Number(old.row.rate) * 100) / 100 } } : old)} /></>}
    </FormModal>
  </View>;
}
