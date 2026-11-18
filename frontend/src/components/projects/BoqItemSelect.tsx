import React, { useCallback } from 'react';
import { View, Text } from 'react-native';
import { useAsyncData } from '@/hooks/useAsyncData';
import { api } from '@/services/api';
import { Select, ErrorState } from '@/components/ui';

export function BoqItemSelect({ projectId, value, onChange, materialOnly = false }: { projectId?: string; value: string; onChange: (id: string, row?: any) => void; materialOnly?: boolean }) {
  const load = useCallback(async () => projectId ? api.getFresh(`/boq/${projectId}`) : null, [projectId]);
  const resource = useAsyncData(load);
  if (!projectId) return null;
  const rows: any[] = resource.data?.lines || (resource.data?.materials || []).map((row: any) => ({ ...row, description: row.name, quantity: row.allocated_quantity, kind: 'material' }));
  const choices = rows.filter(row => row.active && (materialOnly ? row.kind === 'material' : row.kind === 'work'));
  return <View className="gap-2 my-3">
    <Text className="font-semibold text-brand-text dark:text-white">BOQ reference</Text>
    {resource.error ? <ErrorState message="BOQ references could not be loaded." onRetry={resource.retry} /> : <Select value={value} disabled={resource.loading} placeholder={resource.loading ? 'Loading BOQ…' : 'Choose a BOQ item'} options={[{ value: '', label: choices.length ? 'Choose a BOQ reference' : 'No BOQ baseline available' }, ...choices.map(row => ({ value: row.id, label: `${row.description} · ${row.quantity} ${row.unit || ''}` }))]} onValueChange={id => onChange(id, choices.find(row => row.id === id))} />}
    <Text className="text-xs text-slate-500">A reference is required when this project has a BOQ baseline. Add an editable BOQ item first for additional scope. Existing unallocated records remain visible for review.</Text>
  </View>;
}
