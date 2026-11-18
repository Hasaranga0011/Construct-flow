import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import { useAuth } from '@/context/AuthContext';

export function ProjectWorkspaceNav({ projectId }: { projectId: string }) {
  const { role } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const portal = role === 'pm' ? 'pm' : 'admin';
  const base = `/${portal}/projects/${projectId}`;
  const links = [
    ['Overview', base], ['BOQ', `${base}/boq`], ['Milestones', `${base}/milestones`], ['Site reports', `${base}/reports`], ['Issues', `${base}/issues`],
    ['Expenses', `${base}/expenses`], ['Payments & variations', `${base}/commercial`], ['Documents', `${base}/documents`],
    ['Materials', `/${portal}/materials?project=${projectId}`], ['Orders', `/${portal}/materials/orders?project_id=${projectId}`],
    ['Payroll', portal === 'admin' ? `/admin/payroll/generate?project=${projectId}` : `/pm/payroll?project=${projectId}`],
  ];
  return <View className="mb-5 rounded-2xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3">
    <Text className="text-xs font-semibold uppercase text-slate-500 px-2 mb-2">Project workspace</Text>
    <View className="flex-row flex-wrap gap-2">{links.map(([label, href]) => {
      const selected = pathname === href;
      return <Pressable key={label} accessibilityRole="link" accessibilityLabel={label} accessibilityState={{ selected }}
        onPress={() => router.push(href as any)} className={selected ? 'rounded-lg bg-orange-100 px-3 justify-center' : 'rounded-lg bg-slate-50 dark:bg-slate-800 px-3 justify-center'} style={{ minHeight: 44 }}>
        <Text className={selected ? 'font-semibold text-orange-800' : 'font-medium text-slate-700 dark:text-slate-200'}>{label}</Text>
      </Pressable>;
    })}</View>
  </View>;
}
