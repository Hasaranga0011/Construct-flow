import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  Modal,
  FlatList,
  ActivityIndicator,
  Platform,
  ScrollView,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter, useLocalSearchParams } from 'expo-router';

export type DurationPreset =
  | 'Today'
  | 'Last 7 days'
  | 'This week'
  | 'This month'
  | 'Last month'
  | 'This quarter'
  | 'This year'
  | 'Custom';

export interface ProjectOption {
  id: string;
  name: string;
}

export interface ReportFilterValues {
  fromDate: string; // YYYY-MM-DD
  toDate: string;   // YYYY-MM-DD
  preset: DurationPreset;
  selectedProjectIds: string[]; // empty means All Projects
  breakdown: 'combined' | 'per_project';
  status: string;
}

interface ReportFiltersProps {
  projects: ProjectOption[];
  onApplyFilters: (filters: ReportFilterValues) => void;
  onExport: (format: 'pdf' | 'xlsx' | 'csv' | 'zip') => void;
  exporting?: boolean;
  statusOptions?: string[];
  dateExplanation?: string;
}

const PRESETS: DurationPreset[] = [
  'Today',
  'Last 7 days',
  'This week',
  'This month',
  'Last month',
  'This quarter',
  'This year',
  'Custom',
];

function formatDateDisplay(yyyyMmDd: string): string {
  if (!yyyyMmDd) return '';
  const parts = yyyyMmDd.split('-');
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return yyyyMmDd;
}

function computePresetDates(preset: DurationPreset): { from: string; to: string } {
  const now = new Date();
  const formatYmd = (d: Date) => d.toISOString().split('T')[0];

  if (preset === 'Today') {
    const today = formatYmd(now);
    return { from: today, to: today };
  }
  if (preset === 'Last 7 days') {
    const fromD = new Date(now);
    fromD.setDate(now.getDate() - 6);
    return { from: formatYmd(fromD), to: formatYmd(now) };
  }
  if (preset === 'This week') {
    const day = now.getDay();
    const diffToMon = now.getDate() - day + (day === 0 ? -6 : 1);
    const mon = new Date(now.setDate(diffToMon));
    const sun = new Date(mon);
    sun.setDate(mon.getDate() + 6);
    return { from: formatYmd(mon), to: formatYmd(sun) };
  }
  if (preset === 'This month') {
    const y = now.getFullYear();
    const m = now.getMonth();
    const first = new Date(y, m, 1);
    const last = new Date(y, m + 1, 0);
    return { from: formatYmd(first), to: formatYmd(last) };
  }
  if (preset === 'Last month') {
    const y = now.getFullYear();
    const m = now.getMonth() - 1;
    const first = new Date(y, m, 1);
    const last = new Date(y, m + 1, 0);
    return { from: formatYmd(first), to: formatYmd(last) };
  }
  if (preset === 'This quarter') {
    const y = now.getFullYear();
    const q = Math.floor(now.getMonth() / 3);
    const first = new Date(y, q * 3, 1);
    const last = new Date(y, q * 3 + 3, 0);
    return { from: formatYmd(first), to: formatYmd(last) };
  }
  if (preset === 'This year') {
    const y = now.getFullYear();
    const first = new Date(y, 0, 1);
    const last = new Date(y, 11, 31);
    return { from: formatYmd(first), to: formatYmd(last) };
  }
  return { from: '', to: '' };
}

export function ReportFilters({
  projects = [],
  onApplyFilters,
  onExport,
  exporting = false,
  statusOptions = ['All', 'In Progress', 'Completed', 'Active', 'Pending'],
  dateExplanation = 'Date filtering is inclusive and calculated in Asia/Colombo time.',
}: ReportFiltersProps) {
  const router = useRouter();
  const params = useLocalSearchParams<{
    from?: string;
    to?: string;
    preset?: string;
    projects?: string;
    breakdown?: string;
    status?: string;
  }>();

  // Initial values from URL params or default to 'This month'
  const initialPreset: DurationPreset =
    (params.preset as DurationPreset) && PRESETS.includes(params.preset as DurationPreset)
      ? (params.preset as DurationPreset)
      : 'This month';

  const defaultDates = computePresetDates(initialPreset);
  const [preset, setPreset] = useState<DurationPreset>(initialPreset);
  const [fromDate, setFromDate] = useState<string>(params.from || defaultDates.from);
  const [toDate, setToDate] = useState<string>(params.to || defaultDates.to);
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>(
    params.projects ? params.projects.split(',').filter(Boolean) : []
  );
  const [breakdown, setBreakdown] = useState<'combined' | 'per_project'>(
    (params.breakdown as 'combined' | 'per_project') || 'per_project'
  );
  const [status, setStatus] = useState<string>(params.status || 'All');

  const [projectModalOpen, setProjectModalOpen] = useState(false);
  const [projectSearch, setProjectSearch] = useState('');
  const [downloadMenuOpen, setDownloadMenuOpen] = useState(false);

  const handlePresetSelect = (p: DurationPreset) => {
    setPreset(p);
    if (p !== 'Custom') {
      const dates = computePresetDates(p);
      setFromDate(dates.from);
      setToDate(dates.to);
    }
  };

  const handleApply = () => {
    // Sync filters to URL params so reports are bookmarkable/shareable
    const newParams: Record<string, string> = {
      preset,
      from: fromDate,
      to: toDate,
      breakdown,
      status,
    };
    if (selectedProjectIds.length > 0) {
      newParams.projects = selectedProjectIds.join(',');
    }
    router.setParams(newParams);

    onApplyFilters({
      fromDate,
      toDate,
      preset,
      selectedProjectIds,
      breakdown,
      status,
    });
  };

  const handleReset = () => {
    const mDates = computePresetDates('This month');
    setPreset('This month');
    setFromDate(mDates.from);
    setToDate(mDates.to);
    setSelectedProjectIds([]);
    setBreakdown('per_project');
    setStatus('All');

    router.setParams({
      preset: 'This month',
      from: mDates.from,
      to: mDates.to,
      breakdown: 'per_project',
      status: 'All',
      projects: '',
    });

    onApplyFilters({
      fromDate: mDates.from,
      toDate: mDates.to,
      preset: 'This month',
      selectedProjectIds: [],
      breakdown: 'per_project',
      status: 'All',
    });
  };

  const toggleProject = (id: string) => {
    if (selectedProjectIds.includes(id)) {
      setSelectedProjectIds(selectedProjectIds.filter(p => p !== id));
    } else {
      setSelectedProjectIds([...selectedProjectIds, id]);
    }
  };

  const filteredProjects = projects.filter(p =>
    p.name.toLowerCase().includes(projectSearch.toLowerCase())
  );

  return (
    <View className="bg-white rounded-2xl border border-gray-200 p-4 mb-5 shadow-sm">
      {/* Top Row: Presets Strip */}
      <View className="mb-3.5">
        <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
          Duration Preset
        </Text>
        <ScrollView keyboardShouldPersistTaps="handled" horizontal showsHorizontalScrollIndicator={false}>
          <View className="flex-row gap-2">
            {PRESETS.map(p => {
              const active = preset === p;
              return (
                <Pressable
                  key={p}
                  onPress={() => handlePresetSelect(p)}
                  style={{ minHeight: 36, minWidth: 40 }}
                  className={`px-3 py-1.5 rounded-full border items-center justify-center ${active ? 'bg-brand-orange border-brand-orange' : 'bg-gray-50 border-gray-200'}`}
                >
                  <Text
                    maxFontSizeMultiplier={1.3}
                    style={{ flexShrink: 1, minWidth: 0 }}
                    className={`text-xs font-semibold ${active ? 'text-white' : 'text-gray-700'}`}
                  >
                    {p}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>
      </View>

      {/* Second Row: Date Inputs & Projects & Controls */}
      <View className="flex-row flex-wrap -mx-2 items-start">
        {/* Date From */}
        <View className="w-full sm:w-1/2 md:w-1/4 px-2 mb-3">
          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xs font-semibold text-gray-600 mb-1.5">
            From Date (DD/MM/YYYY)
          </Text>
          <View style={{ height: 42 }} className="border border-gray-200 rounded-lg px-3 bg-gray-50 flex-row items-center">
            <Ionicons name="calendar-outline" size={16} color="#6B7280" className="mr-2" />
            <TextInput
              maxFontSizeMultiplier={1.3}
              style={{ flex: 1, height: '100%' }}
              placeholder="YYYY-MM-DD"
              value={fromDate}
              onChangeText={val => {
                setFromDate(val);
                setPreset('Custom');
              }}
              className="text-xs text-brand-text font-medium"
            />
          </View>
          <View style={{ minHeight: 18, marginTop: 3 }}>
            {!!fromDate && (
              <Text maxFontSizeMultiplier={1.3} className="text-[10px] text-gray-400">
                Showing: {formatDateDisplay(fromDate)}
              </Text>
            )}
          </View>
        </View>

        {/* Date To */}
        <View className="w-full sm:w-1/2 md:w-1/4 px-2 mb-3">
          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xs font-semibold text-gray-600 mb-1.5">
            To Date (DD/MM/YYYY)
          </Text>
          <View style={{ height: 42 }} className="border border-gray-200 rounded-lg px-3 bg-gray-50 flex-row items-center">
            <Ionicons name="calendar-outline" size={16} color="#6B7280" className="mr-2" />
            <TextInput
              maxFontSizeMultiplier={1.3}
              style={{ flex: 1, height: '100%' }}
              placeholder="YYYY-MM-DD"
              value={toDate}
              onChangeText={val => {
                setToDate(val);
                setPreset('Custom');
              }}
              className="text-xs text-brand-text font-medium"
            />
          </View>
          <View style={{ minHeight: 18, marginTop: 3 }}>
            {!!toDate && (
              <Text maxFontSizeMultiplier={1.3} className="text-[10px] text-gray-400">
                Showing: {formatDateDisplay(toDate)}
              </Text>
            )}
          </View>
        </View>

        {/* Project Multi-Select Filter */}
        <View className="w-full sm:w-1/2 md:w-1/4 px-2 mb-3">
          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xs font-semibold text-gray-600 mb-1.5">
            Project Filter
          </Text>
          <Pressable
            style={{ height: 42 }}
            onPress={() => setProjectModalOpen(true)}
            className="border border-gray-200 bg-gray-50 rounded-lg px-3 flex-row justify-between items-center"
          >
            <Text
              numberOfLines={1}
              maxFontSizeMultiplier={1.3}
              style={{ flexShrink: 1, minWidth: 0 }}
              className="text-xs text-brand-text font-medium"
            >
              {selectedProjectIds.length === 0
                ? 'All Projects'
                : `${selectedProjectIds.length} project(s) selected`}
            </Text>
            <Ionicons name="chevron-down" size={16} color="#6B7280" />
          </Pressable>
          <View style={{ minHeight: 18, marginTop: 3 }} />
        </View>

        {/* Breakdown Scope Toggle */}
        <View className="w-full sm:w-1/2 md:w-1/4 px-2 mb-3">
          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xs font-semibold text-gray-600 mb-1.5">
            Breakdown View
          </Text>
          <View style={{ height: 42 }} className="flex-row rounded-lg border border-gray-200 p-1 bg-gray-100 items-center">
            <Pressable
              onPress={() => setBreakdown('per_project')}
              style={{ height: '100%' }}
              className={`flex-1 rounded-md items-center justify-center ${breakdown === 'per_project' ? 'bg-white shadow-xs' : ''}`}
            >
              <Text maxFontSizeMultiplier={1.3} className={`text-xs font-semibold ${breakdown === 'per_project' ? 'text-brand-orange' : 'text-gray-600'}`}>
                Per project
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setBreakdown('combined')}
              style={{ height: '100%' }}
              className={`flex-1 rounded-md items-center justify-center ${breakdown === 'combined' ? 'bg-white shadow-xs' : ''}`}
            >
              <Text maxFontSizeMultiplier={1.3} className={`text-xs font-semibold ${breakdown === 'combined' ? 'text-brand-orange' : 'text-gray-600'}`}>
                Combined
              </Text>
            </Pressable>
          </View>
          <View style={{ minHeight: 18, marginTop: 3 }} />
        </View>
      </View>

      {/* Buttons Row: Apply, Reset & Download Menu */}
      <View className="flex-row flex-wrap justify-between items-center pt-3 border-t border-gray-100 gap-2">
        <View className="flex-row gap-2">
          <Pressable
            onPress={handleApply}
            style={{ minHeight: 40, minWidth: 80 }}
            className="bg-brand-orange px-5 py-2 rounded-lg items-center justify-center flex-row"
          >
            <Ionicons name="checkmark-circle-outline" size={16} color="white" className="mr-1.5" />
            <Text maxFontSizeMultiplier={1.3} className="text-white text-xs font-bold">Apply</Text>
          </Pressable>

          <Pressable
            onPress={handleReset}
            style={{ minHeight: 40, minWidth: 80 }}
            className="bg-gray-100 hover:bg-gray-200 px-4 py-2 rounded-lg items-center justify-center flex-row"
          >
            <Ionicons name="refresh-outline" size={16} color="#4B5563" className="mr-1.5" />
            <Text maxFontSizeMultiplier={1.3} className="text-gray-700 text-xs font-semibold">Reset</Text>
          </Pressable>
        </View>

        {/* Download Button + Menu */}
        <View className="relative">
          <Pressable
            onPress={() => setDownloadMenuOpen(!downloadMenuOpen)}
            disabled={exporting}
            style={{ minHeight: 40 }}
            className="bg-orange-50 border border-orange-200 px-4 py-2 rounded-lg flex-row items-center"
          >
            {exporting ? (
              <ActivityIndicator size="small" color="#EA580C" className="mr-2" />
            ) : (
              <Ionicons name="download-outline" size={16} color="#EA580C" className="mr-1.5" />
            )}
            <Text maxFontSizeMultiplier={1.3} className="text-brand-orange text-xs font-bold">
              {exporting ? 'Generating...' : 'Export Report'}
            </Text>
            <Ionicons name="chevron-down" size={14} color="#EA580C" className="ml-1.5" />
          </Pressable>

          {downloadMenuOpen && (
            <View className="absolute right-0 bottom-12 bg-white rounded-xl shadow-xl border border-gray-200 w-56 z-50 p-1.5">
              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-[10px] font-bold text-gray-400 uppercase px-2.5 py-1">
                Download Format
              </Text>
              <Pressable
                onPress={() => {
                  setDownloadMenuOpen(false);
                  onExport('pdf');
                }}
                className="px-3 py-2 rounded-lg hover:bg-orange-50 flex-row items-center"
              >
                <Ionicons name="document-text" size={16} color="#EA580C" className="mr-2.5" />
                <View>
                  <Text maxFontSizeMultiplier={1.3} className="text-xs font-bold text-gray-800">PDF Report</Text>
                  <Text maxFontSizeMultiplier={1.3} className="text-[10px] text-gray-500">Official branded tables</Text>
                </View>
              </Pressable>
              <Pressable
                onPress={() => {
                  setDownloadMenuOpen(false);
                  onExport('xlsx');
                }}
                className="px-3 py-2 rounded-lg hover:bg-orange-50 flex-row items-center"
              >
                <Ionicons name="grid" size={16} color="#16A34A" className="mr-2.5" />
                <View>
                  <Text maxFontSizeMultiplier={1.3} className="text-xs font-bold text-gray-800">Excel (.xlsx)</Text>
                  <Text maxFontSizeMultiplier={1.3} className="text-[10px] text-gray-500">Real numeric cells & sheets</Text>
                </View>
              </Pressable>
              <Pressable
                onPress={() => {
                  setDownloadMenuOpen(false);
                  onExport('csv');
                }}
                className="px-3 py-2 rounded-lg hover:bg-orange-50 flex-row items-center"
              >
                <Ionicons name="list" size={16} color="#2563EB" className="mr-2.5" />
                <View>
                  <Text maxFontSizeMultiplier={1.3} className="text-xs font-bold text-gray-800">CSV Raw Data</Text>
                  <Text maxFontSizeMultiplier={1.3} className="text-[10px] text-gray-500">Comma-separated values</Text>
                </View>
              </Pressable>
              <View className="h-px bg-gray-100 my-1" />
              <Pressable
                onPress={() => {
                  setDownloadMenuOpen(false);
                  onExport('zip');
                }}
                className="px-3 py-2 rounded-lg hover:bg-orange-50 flex-row items-center"
              >
                <Ionicons name="archive" size={16} color="#9333EA" className="mr-2.5" />
                <View>
                  <Text maxFontSizeMultiplier={1.3} className="text-xs font-bold text-gray-800">ZIP (Per Project)</Text>
                  <Text maxFontSizeMultiplier={1.3} className="text-[10px] text-gray-500">One file per project</Text>
                </View>
              </Pressable>
            </View>
          )}
        </View>
      </View>

      {/* Date Explanation Note */}
      <View className="mt-2.5 pt-2 border-t border-gray-50 flex-row items-center">
        <Ionicons name="information-circle-outline" size={13} color="#9CA3AF" className="mr-1" />
        <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-[11px] text-gray-400">
          {dateExplanation}
        </Text>
      </View>

      {/* Project Multi-Select Modal */}
      <Modal
        visible={projectModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setProjectModalOpen(false)}
      >
        <View className="flex-1 bg-black/40 justify-center items-center p-4">
          <View className="bg-white rounded-2xl w-full max-w-md max-h-[80%] p-4 shadow-xl">
            <View className="flex-row justify-between items-center mb-3">
              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-base font-bold text-gray-900">
                Filter by Project
              </Text>
              <Pressable
                onPress={() => setProjectModalOpen(false)}
                style={{ minHeight: 36, minWidth: 36 }}
                className="items-center justify-center rounded-full hover:bg-gray-100"
              >
                <Ionicons name="close" size={20} color="#6B7280" />
              </Pressable>
            </View>

            <View className="flex-row items-center border border-gray-300 rounded-xl px-3 py-2 mb-3 bg-gray-50">
              <Ionicons name="search" size={16} color="#9CA3AF" className="mr-2" />
              <TextInput
                maxFontSizeMultiplier={1.3}
                style={{ flex: 1, minHeight: 28 }}
                placeholder="Search projects..."
                placeholderTextColor="#9CA3AF"
                className="text-sm text-gray-900"
                value={projectSearch}
                onChangeText={setProjectSearch}
              />
            </View>

            <View className="flex-row justify-between mb-2 px-1">
              <Pressable onPress={() => setSelectedProjectIds([])}>
                <Text maxFontSizeMultiplier={1.3} className="text-xs font-semibold text-brand-orange">
                  Select All
                </Text>
              </Pressable>
              <Pressable onPress={() => setSelectedProjectIds([])}>
                <Text maxFontSizeMultiplier={1.3} className="text-xs font-semibold text-gray-500">
                  Clear
                </Text>
              </Pressable>
            </View>

            <FlatList
              data={filteredProjects}
              keyExtractor={item => item.id}
              renderItem={({ item }) => {
                const isSelected = selectedProjectIds.includes(item.id);
                return (
                  <Pressable
                    style={{ minHeight: 44 }}
                    onPress={() => toggleProject(item.id)}
                    className={`px-3 py-2.5 rounded-lg flex-row justify-between items-center ${isSelected ? 'bg-orange-50' : 'hover:bg-gray-50'}`}
                  >
                    <Text
                      maxFontSizeMultiplier={1.3}
                      style={{ flexShrink: 1, minWidth: 0 }}
                      className={`text-sm ${isSelected ? 'font-bold text-brand-orange' : 'text-gray-700'}`}
                    >
                      {item.name}
                    </Text>
                    <Ionicons
                      name={isSelected ? 'checkbox' : 'square-outline'}
                      size={20}
                      color={isSelected ? '#F97316' : '#D1D5DB'}
                    />
                  </Pressable>
                );
              }}
              ListEmptyComponent={
                <View className="py-6 items-center">
                  <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-400 text-sm">
                    No projects match your search
                  </Text>
                </View>
              }
            />

            <Pressable
              onPress={() => setProjectModalOpen(false)}
              className="bg-brand-orange mt-3 py-3 rounded-xl items-center"
            >
              <Text maxFontSizeMultiplier={1.3} className="text-white font-bold text-sm">
                Done ({selectedProjectIds.length === 0 ? 'All' : selectedProjectIds.length} selected)
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}
