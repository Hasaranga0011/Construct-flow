import React, { useCallback, useState } from 'react';
import { View, Text } from 'react-native';
import { ContentScrollView as ScrollView } from '@/components/common/ContentScrollView';
import { TopNav } from '@/components/common/TopNav';
import { api } from '@/services/api';
import { useAsyncData } from '@/hooks/useAsyncData';
import { Button, Card, EmptyState, ErrorState, LoadingState, Select, Toolbar } from '@/components/ui';
import { auditTableLabels, auditFieldLabel, auditRoleLabel, auditHeading, auditValue, auditOmittedMessage, auditChangedFields } from '@/utils/auditDisplay';

type AuditEvent = {
  id: string; occurred_at: string; actor_id: string | null; actor_role: string;
  table_name: string; action: string; record_id: string | null; project_id: string | null;
  changed_fields: string[]; before_data: Record<string, unknown> | null;
  after_data: Record<string, unknown> | null; transaction_id: string;
  actor_name?: string | null; project_name?: string | null; record_name?: string | null;
  reference_names?: Record<string,string>;
  current_values?: Record<string,unknown>;
};
const tables = ['projects', 'profiles', 'attendance', 'salary_slips', 'purchase_orders', 'materials',
  'material_requests', 'project_expenses', 'milestones', 'client_payment_schedule', 'variation_orders',
  'project_boq_revisions', 'project_boq_worker_rates', 'project_role_assignments', 'site_workers',
  'site_manager_sites', 'pm_projects', 'sites', 'workers', 'worker_details', 'material_catalog',
  'attendance_reviews', 'delivery_receipts', 'estimations', 'issues', 'site_reports', 'shared_documents',
  'inventory_logs', 'milestone_media', 'milestone_notes', 'project_locations', 'site_materials', 'cost_estimates'];

export default function AuditScreen() {
  const [action, setAction] = useState('');
  const [table, setTable] = useState('');
  const [cursors, setCursors] = useState<string[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const cursor = cursors[cursors.length - 1];
  const load = useCallback(async () => {
    const params = new URLSearchParams({ limit: '25' });
    if (action) params.set('action', action);
    if (table) params.set('table', table);
    if (cursor) params.set('before_id', cursor);
    return api.getFresh(`/audit/?${params}`) as Promise<{ events: AuditEvent[]; next_cursor: string | null }>;
  }, [action, table, cursor]);
  const resource = useAsyncData(load);
  const changeFilter = (kind: 'action' | 'table', value: string) => {
    setCursors([]); setExpanded(null);
    if (kind === 'action') setAction(value); else setTable(value);
  };
  return <View className="flex-1 bg-brand-light dark:bg-slate-950">
    <TopNav title="Audit Logs" showAction={false} />
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
      <View className="w-full max-w-6xl mx-auto gap-4">
        <Card>
          <Text accessibilityRole="header" className="text-2xl font-bold text-brand-text dark:text-white">System activity</Text>
          <Text className="text-sm text-slate-600 dark:text-slate-300 mt-2 mb-4">See who changed users, projects, orders and payments. History starts when audit logging was enabled.</Text>
          <Toolbar>
            <View style={{ width: 240, maxWidth: '100%', minWidth: 0 }}><Select value={action} onValueChange={value => changeFilter('action', value)} options={[{ value: '', label: 'All actions' }, ...['INSERT', 'UPDATE', 'DELETE'].map(value => ({ value, label: value === 'INSERT' ? 'Created' : value === 'UPDATE' ? 'Updated' : 'Deleted' }))]} /></View>
            <View style={{ width: 280, maxWidth: '100%', minWidth: 0 }}><Select value={table} onValueChange={value => changeFilter('table', value)} options={[{ value: '', label: 'All records' }, ...tables.map(value => ({ value, label: auditTableLabels[value] || value }))]} /></View>
            <Button label="Refresh logs" variant="secondary" loading={resource.loading} onPress={() => { setCursors([]); setExpanded(null); resource.retry(); }} />
          </Toolbar>
        </Card>
        {resource.loading ? <LoadingState /> : resource.error ? <ErrorState message={resource.error} onRetry={resource.retry} /> : !resource.data?.events.length ? <EmptyState title="No audit events" message="No recorded changes match these filters." icon="shield-checkmark-outline" /> : resource.data.events.map(event => <Card key={event.id}>
          <View className="flex-row flex-wrap items-start justify-between gap-3">
            <View className="flex-1 min-w-0">
              <Text className="font-bold text-brand-text dark:text-white">{auditHeading(event.table_name, event.action)}</Text>
              <Text className="text-sm text-slate-500 mt-1">{new Date(event.occurred_at).toLocaleString('en-GB', { timeZone: 'Asia/Colombo', day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit' })} · Sri Lanka time</Text>
            </View>
            <Button label={expanded === event.id ? 'Hide details' : 'View details'} variant="secondary" size="compact" onPress={() => setExpanded(expanded === event.id ? null : event.id)} />
          </View>
          <Text className="text-sm text-slate-600 dark:text-slate-300 mt-3">By {event.actor_name || (event.actor_id ? 'User name unavailable' : 'System / database operation')}{event.actor_id ? ` · ${auditRoleLabel(event.actor_role)}` : ''}</Text>
          <Text className="text-sm font-semibold text-slate-700 dark:text-slate-200 mt-2">{event.record_name || (event.table_name === 'projects' ? event.project_name : null) || 'Record name unavailable'}</Text>
          {!!event.project_name && event.table_name !== 'projects' && <Text className="text-sm text-slate-500 mt-1">Project: {event.project_name}</Text>}
          <Text className="text-sm text-slate-500 mt-2">{auditChangedFields(event.changed_fields).slice(0,3).map(auditFieldLabel).join(', ') || 'Record information'}{auditChangedFields(event.changed_fields).length>3 ? ` and ${auditChangedFields(event.changed_fields).length-3} more fields` : ''} {event.action === 'UPDATE' ? 'changed' : event.action === 'INSERT' ? 'recorded' : 'removed'}</Text>
          {expanded === event.id && <View className="mt-4 border-t border-slate-200 dark:border-slate-700 pt-4 gap-3">
            {event.changed_fields.map(field => {
              const before = !!event.before_data && field in event.before_data;
              const after = !!event.after_data && field in event.after_data;
              return <View key={field} className="gap-1">
                <Text className="font-semibold text-brand-text dark:text-white">{auditFieldLabel(field)}</Text>
                {!before && !after ? <>
                  <Text className="text-sm text-slate-500">{auditOmittedMessage(field)}</Text>
                  {!!event.current_values && field in event.current_values && <View className="mt-2 border-l-2 border-orange-200 pl-3 gap-1">
                    <Text selectable className="text-sm text-slate-700 dark:text-slate-200">Current saved value: {auditValue(field,event.current_values[field],event.reference_names)}</Text>
                    <Text className="text-xs text-slate-500">This is the record’s value now, not proof of its value when this older event occurred.</Text>
                  </View>}
                </> : <>
                  {event.action !== 'INSERT' && <Text selectable className="text-sm text-slate-500">Before: {before ? auditValue(field,event.before_data![field],event.reference_names) : 'Not captured in this log'}</Text>}
                  {event.action !== 'DELETE' && <Text selectable className="text-sm text-slate-600 dark:text-slate-300">After: {after ? auditValue(field,event.after_data![field],event.reference_names) : 'Not captured in this log'}</Text>}
                </>}
              </View>;
            })}
            <Text className="text-xs text-slate-500">Names refer to current records. Original IDs remain available below.</Text>
            <View className="gap-2">
              <Text className="font-semibold text-brand-text dark:text-white">Record references</Text>
              <Text selectable className="text-xs text-slate-500">Event: {event.id} · Transaction: {event.transaction_id}</Text>
              <Text selectable className="text-xs text-slate-500">User ID: {event.actor_id || 'Not available'}</Text>
              <Text selectable className="text-xs text-slate-500">Record ID: {event.record_id || 'Composite record'}</Text>
              {!!event.project_id && <Text selectable className="text-xs text-slate-500">Project ID: {event.project_id}</Text>}
            </View>
          </View>}
        </Card>)}
        <View className="flex-row flex-wrap justify-between gap-3">
          <Button label="Newer events" variant="secondary" disabled={!cursors.length || resource.loading} onPress={() => { setCursors(values => values.slice(0, -1)); setExpanded(null); }} />
          <Button label="Older events" variant="secondary" disabled={!resource.data?.next_cursor || resource.loading || !!resource.error} onPress={() => { if (resource.data?.next_cursor) setCursors(values => [...values, resource.data!.next_cursor!]); setExpanded(null); }} />
        </View>
      </View>
    </ScrollView>
  </View>;
}
