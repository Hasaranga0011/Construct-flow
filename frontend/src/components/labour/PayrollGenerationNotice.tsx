import React from 'react';
import { View, Text } from 'react-native';
import { Button, InlineNotice } from '@/components/ui';

export type PayrollConflict = { id: string; worker_id: string; worker_name?: string; period_start: string; period_end: string; status?: string };
export function payrollFailure(detail: unknown): { message: string; conflicts: PayrollConflict[] } {
  if (detail && typeof detail === 'object' && 'message' in detail && typeof detail.message === 'string') {
    return { message: detail.message, conflicts: 'conflicts' in detail && Array.isArray(detail.conflicts) ? detail.conflicts : [] };
  }
  if (typeof detail === 'string' && /overlap|23505/i.test(detail)) return { message: 'Salary slips already cover part of this period. Review existing slips and choose a non-overlapping period.', conflicts: [] };
  return { message: typeof detail === 'string' && !/\b(code|hint|details)\b/.test(detail) ? detail : 'Salary slips could not be generated. Please try again.', conflicts: [] };
}

export function PayrollGenerationNotice({ message, conflicts, onView }: { message: string; conflicts: PayrollConflict[]; onView: (conflict?: PayrollConflict) => void }) {
  if (!message) return null;
  return <View className="mb-4">
    <InlineNotice message={message} />
    {conflicts.map(row => <View key={row.id} className="mb-3 rounded-xl border border-slate-200 p-3">
      <Text className="font-semibold text-slate-800">{row.worker_name || 'Worker'}</Text>
      <Text className="text-sm text-slate-600 mb-2">{row.period_start} to {row.period_end}{row.status ? ` · ${row.status}` : ''}</Text>
      <Button label="View existing salary slip" variant="secondary" size="compact" onPress={() => onView(row)} />
    </View>)}
    {!conflicts.length && <Button label="View existing payroll" variant="secondary" onPress={() => onView()} />}
  </View>;
}
