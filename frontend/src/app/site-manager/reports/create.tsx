import { dataError } from '@/services/siteData';
import { pickSitePhoto } from '@/services/sitePhoto';
import { PhotoCaptureModal } from '@/components/common/PhotoCaptureModal';
import { validReportDate, validWorkerCount } from '@/utils/siteWorkflow';
import { notify } from '@/utils/notify';
import React, { useEffect, useState, useMemo } from 'react';
import {
  View, Text, ScrollView, TextInput, Pressable,
  ActivityIndicator, Platform, Image, Modal,
} from 'react-native';
import { TopNav } from '@/components/common/TopNav';
import Ionicons from '@expo/vector-icons/Ionicons';
import { supabase } from '../../../lib/supabase';
import { api } from '../../../services/api';
import { useRouter } from 'expo-router';
import { NoAssignedSites } from '@/components/common/NoAssignedSites';
import { ModalViewport } from '@/components/common/ModalViewport';
import { useAssignedSites } from '@/hooks/useAssignedSites';
import { useAuth } from '@/context/AuthContext';

type Project = { id: string; name: string; siteId: string };
type MaterialUsedItem = { name: string; qty: number; unit: string };

const WORK_TEMPLATES = [
  'Foundation / Concrete',
  'Masonry / Brickwork',
  'Steel / Formwork',
  'Plumbing / Electrical',
  'Plastering / Finishing',
  'Site Safety Inspection',
];

const FALLBACK_MATERIALS: Array<{ name: string; unit: string }> = [
  { name: 'Cement (50kg Bag)', unit: 'bags' },
  { name: 'River Sand', unit: 'cubes' },
  { name: 'Aggregate / Metal', unit: 'cubes' },
  { name: 'Steel Rebar', unit: 'kg' },
  { name: 'Concrete Blocks', unit: 'nos' },
  { name: 'Clay Bricks', unit: 'nos' },
];

export default function CreateSiteReportPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [loadError, setLoadError] = useState('');
  const { assignedProjectIds, assignments, loading: sitesLoading, error: assignmentError, refresh: refreshAssignments } = useAssignedSites(user?.id);
  const [loading, setLoading] = useState(false);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);

  // Form state
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [workCompleted, setWorkCompleted] = useState('');
  const [workerCount, setWorkerCount] = useState('');
  const [blockers, setBlockers] = useState('');
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [showPhotoModal, setShowPhotoModal] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);

  // Enhanced context & materials used
  const [attendanceCount, setAttendanceCount] = useState<number | null>(null);
  const [duplicateExists, setDuplicateExists] = useState(false);
  const [projectMaterials, setProjectMaterials] = useState<Array<{ name: string; unit: string }>>([]);
  const [materialsUsed, setMaterialsUsed] = useState<MaterialUsedItem[]>([]);
  const [matModalOpen, setMatModalOpen] = useState(false);
  const [matName, setMatName] = useState('');
  const [matQty, setMatQty] = useState('');
  const [matUnit, setMatUnit] = useState('units');

  const todayIso = useMemo(() => new Date().toISOString().split('T')[0], []);
  const yesterdayIso = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().split('T')[0];
  }, []);

  useEffect(() => {
    const loadProjects = async () => {
      if (!user?.id || sitesLoading) return;

      try {
        if (!assignedProjectIds.length) {
          setProjectsLoading(false);
          return;
        }

        const { data: projectsData, error: projectsDataError } = await supabase
          .from('projects')
          .select('id, name')
          .in('id', assignedProjectIds)
          ;
      if (projectsDataError) throw projectsDataError;

        const parsed: Project[] = (projectsData || []).map((p: any) => {
          const assignment = assignments.find((a: any) => a.projectId === p.id);
          return { id: p.id, name: p.name, siteId: assignment?.assignmentId || '' };
        });
        setProjects(parsed);
        if (parsed.length > 0) setSelectedProjectId(parsed[0].id);
      } catch (error) {
        setLoadError(dataError(error));
      } finally {
        setProjectsLoading(false);
      }
    };
    loadProjects();
  }, [user?.id, sitesLoading, assignedProjectIds, assignments]);

  useEffect(() => {
    let active = true;
    const loadProjectContext = async () => {
      if (!selectedProjectId || !validReportDate(date)) {
        setAttendanceCount(null);
        setDuplicateExists(false);
        return;
      }
      try {
        const [sitesRes, matRes, dupRes] = await Promise.all([
          supabase.from('sites').select('id').eq('project_id', selectedProjectId),
          supabase.from('materials').select('name, unit').eq('project_id', selectedProjectId).order('name'),
          supabase.from('site_reports').select('id').eq('project_id', selectedProjectId).eq('date', date).limit(1),
        ]);
        if (!active) return;

        setDuplicateExists(Boolean(dupRes.data && dupRes.data.length > 0));

        const seen = new Set<string>();
        const mergedMats: Array<{ name: string; unit: string }> = [];
        for (const m of (matRes.data || [])) {
          const n = String(m.name || '').trim();
          if (!n || seen.has(n.toLowerCase())) continue;
          seen.add(n.toLowerCase());
          mergedMats.push({ name: n, unit: m.unit || 'units' });
        }
        for (const f of FALLBACK_MATERIALS) {
          if (seen.has(f.name.toLowerCase())) continue;
          seen.add(f.name.toLowerCase());
          mergedMats.push(f);
        }
        setProjectMaterials(mergedMats);

        const siteIds = (sitesRes.data || []).map((s: any) => s.id).filter(Boolean);
        if (siteIds.length > 0) {
          const { count } = await supabase
            .from('attendance')
            .select('*', { count: 'exact', head: true })
            .in('site_id', siteIds)
            .eq('date', date);
          if (active) {
            setAttendanceCount(count ?? 0);
            setWorkerCount(prev => (!prev && count != null ? String(count) : prev));
          }
        } else if (active) {
          setAttendanceCount(null);
        }
      } catch {
        // Non-blocking context helper
      }
    };
    loadProjectContext();
    return () => { active = false; };
  }, [selectedProjectId, date]);

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!selectedProjectId) errs.project = 'Please select a project';
    if (!workCompleted.trim()) errs.workCompleted = 'Work completed is required';
    if (!validReportDate(date)) errs.date = 'Enter a valid date as YYYY-MM-DD';
    if (!validWorkerCount(workerCount)) errs.workerCount = 'Enter a whole number of workers, zero or more';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const uploadPhoto = async () => {
    if (!selectedProjectId || photoUploading || loading) return;
    setPhotoUploading(true);
    try {
      const url = await pickSitePhoto(selectedProjectId, 'Daily site report');
      if (url) setPhotoUrls(prev => [...prev, url]);
    } catch (error: any) { notify('Photo upload failed', error.message); }
    finally { setPhotoUploading(false); }
  };

  const handleSubmit = async () => {
    if (loading || photoUploading || !validate()) return;

    const selectedProject = projects.find(p => p.id === selectedProjectId);
    if (!selectedProject) return;

    setLoading(true);
    try {
      await api.siteReports.create({
        project_id: selectedProjectId,
        site_id: selectedProject.siteId || undefined,
        date,
        work_completed: workCompleted.trim(),
        workers_present_count: workerCount ? parseInt(workerCount, 10) : undefined,
        blockers: blockers.trim() || undefined,
        photos: photoUrls.length > 0 ? photoUrls : undefined,
        materials_used: materialsUsed.length > 0 ? materialsUsed : undefined,
      });

      setSubmitted(true);
      router.replace('/site-manager/reports');
    } catch (error: any) {
      const msg = error.message || 'Failed to submit report';
      if (Platform.OS === 'web') {
        window.alert(msg);
      } else {
        notify('Error', msg);
      }
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <View className="flex-1 bg-brand-light items-center justify-center p-8">
        <View className="bg-white rounded-2xl p-10 items-center shadow-sm border border-gray-100 w-full max-w-md">
          <View className="w-16 h-16 bg-green-100 rounded-full items-center justify-center mb-4">
            <Ionicons name="checkmark" size={36} color="#22C55E" />
          </View>
          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-2xl font-bold text-brand-text mb-2">Report Submitted!</Text>
          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500 text-center">Your daily site report has been submitted. You can view it in Site Reports.</Text>
        </View>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-brand-light">
      <TopNav title="New Site Report" showAction={false} />
      {loadError || assignmentError ? <View className="bg-red-50 p-3"><Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-red-700">{loadError || assignmentError}</Text><Text style={[{ flexShrink: 1, minWidth: 0 }, { minHeight: 44, minWidth: 44 }]} maxFontSizeMultiplier={1.3} accessibilityRole="button" onPress={refreshAssignments} className="text-brand-orange font-bold mt-2">Reload site assignments</Text></View> : null}

      {projectsLoading || sitesLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#F97316" />
        </View>
      ) : assignedProjectIds.length === 0 ? (
        <NoAssignedSites />
      ) : (
        <ScrollView keyboardShouldPersistTaps="handled" className="flex-1 p-4" showsVerticalScrollIndicator={false}>
          <View className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-6">

            {/* Project picker */}
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-sm font-bold text-gray-700 mb-1">Project <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-red-500">*</Text></Text>
            <ScrollView keyboardShouldPersistTaps="handled" horizontal showsHorizontalScrollIndicator={false} className="flex-row mb-5">
              {projects.map(p => (
                <Pressable style={{ minHeight: 44, minWidth: 44 }}
                  key={p.id}
                  disabled={loading || photoUploading}
                  onPress={() => { setSelectedProjectId(p.id); setPhotoUrls([]); }}
                  className={`mr-3 px-4 py-2 rounded-full border ${selectedProjectId === p.id ? 'bg-brand-orange border-brand-orange' : 'border-gray-200 bg-gray-50'}`}
                >
                  <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className={`font-semibold text-sm ${selectedProjectId === p.id ? 'text-white' : 'text-gray-600'}`}>{p.name}</Text>
                </Pressable>
              ))}
            </ScrollView>
            {errors.project && <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-red-500 text-xs mb-3">{errors.project}</Text>}

            {/* Date */}
            <View className="flex-row items-center justify-between mb-1">
              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-sm font-bold text-gray-700">Report Date <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-red-500">*</Text></Text>
              <View className="flex-row gap-2">
                <Pressable onPress={() => setDate(todayIso)} className={`px-2.5 py-1 rounded-full border ${date === todayIso ? 'bg-orange-50 border-brand-orange' : 'bg-gray-50 border-gray-200'}`}>
                  <Text className={`text-xs font-semibold ${date === todayIso ? 'text-brand-orange' : 'text-gray-600'}`}>Today</Text>
                </Pressable>
                <Pressable onPress={() => setDate(yesterdayIso)} className={`px-2.5 py-1 rounded-full border ${date === yesterdayIso ? 'bg-orange-50 border-brand-orange' : 'bg-gray-50 border-gray-200'}`}>
                  <Text className={`text-xs font-semibold ${date === yesterdayIso ? 'text-brand-orange' : 'text-gray-600'}`}>Yesterday</Text>
                </Pressable>
              </View>
            </View>
            <TextInput maxFontSizeMultiplier={1.3} style={{ minHeight: 44, minWidth: 44 }}
              className={`border ${errors.date ? 'border-red-400' : 'border-gray-300'} rounded-xl p-3 mb-4 text-brand-text bg-gray-50`}
              value={date}
              onChangeText={setDate}
              placeholder="YYYY-MM-DD"
            />
            {errors.date && <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-red-500 text-xs -mt-3 mb-3">{errors.date}</Text>}

            {duplicateExists && (
              <View className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-5 flex-row items-start gap-2">
                <Ionicons name="alert-circle-outline" size={18} color="#D97706" style={{ marginTop: 1 }} />
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-amber-800 text-xs font-medium flex-1">
                  A daily report for this project on {date} has already been submitted. Change the date to submit another day&apos;s report.
                </Text>
              </View>
            )}

            {/* Work completed */}
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-sm font-bold text-gray-700 mb-1.5">Work Completed Today <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-red-500">*</Text></Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" className="flex-row mb-2">
              {WORK_TEMPLATES.map(tag => (
                <Pressable
                  key={tag}
                  onPress={() => setWorkCompleted(prev => prev.trim() ? `${prev.trim()}\n• ${tag}: ` : `• ${tag}: `)}
                  className="mr-2 px-3 py-1.5 rounded-full bg-gray-100 border border-gray-200"
                >
                  <Text className="text-xs font-medium text-gray-700">+ {tag}</Text>
                </Pressable>
              ))}
            </ScrollView>
            <TextInput maxFontSizeMultiplier={1.3} style={{ minHeight: 44, minWidth: 44 }}
              className={`border ${errors.workCompleted ? 'border-red-400' : 'border-gray-300'} rounded-xl p-3 mb-5 text-brand-text bg-gray-50 min-h-[110px]`}
              multiline
              textAlignVertical="top"
              value={workCompleted}
              onChangeText={setWorkCompleted}
              placeholder="Describe the work completed today in detail..."
            />
            {errors.workCompleted && <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-red-500 text-xs -mt-4 mb-3">{errors.workCompleted}</Text>}

            {/* Worker count */}
            <View className="flex-row items-center justify-between mb-1">
              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-sm font-bold text-gray-700">Workers Present</Text>
              {attendanceCount !== null && (
                <Pressable
                  onPress={() => setWorkerCount(String(attendanceCount))}
                  className="bg-blue-50 border border-blue-200 px-2.5 py-1 rounded-full"
                >
                  <Text className="text-xs font-semibold text-blue-700">Attendance: {attendanceCount} (Tap to use)</Text>
                </Pressable>
              )}
            </View>
            <TextInput maxFontSizeMultiplier={1.3} style={{ minHeight: 44, minWidth: 44 }}
              className="border border-gray-300 rounded-xl p-3 mb-5 text-brand-text bg-gray-50"
              keyboardType="number-pad"
              value={workerCount}
              onChangeText={setWorkerCount}
              placeholder="Number of workers on site today"
            />

            {errors.workerCount && <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-red-500 mb-3">{errors.workerCount}</Text>}

            {/* Materials Used Today */}
            <View className="mb-5">
              <View className="flex-row items-center justify-between mb-2">
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-sm font-bold text-gray-700">Materials Used Today</Text>
                <Pressable
                  onPress={() => setMatModalOpen(true)}
                  className="bg-orange-50 border border-orange-200 px-3 py-1.5 rounded-lg flex-row items-center gap-1"
                >
                  <Ionicons name="add" size={14} color="#F97316" />
                  <Text className="text-xs font-bold text-brand-orange">Add Material</Text>
                </Pressable>
              </View>
              {materialsUsed.length === 0 ? (
                <Text className="text-xs text-gray-400 italic">No materials logged yet (optional).</Text>
              ) : (
                <View className="flex-row flex-wrap gap-2">
                  {materialsUsed.map((m, idx) => (
                    <View key={`${m.name}-${idx}`} className="flex-row items-center bg-orange-50 border border-orange-200 rounded-xl px-3 py-2 gap-2">
                      <Text className="text-xs font-semibold text-gray-800">{m.name}: {m.qty} {m.unit}</Text>
                      <Pressable onPress={() => setMaterialsUsed(prev => prev.filter((_, i) => i !== idx))}>
                        <Ionicons name="close-circle" size={16} color="#F97316" />
                      </Pressable>
                    </View>
                  ))}
                </View>
              )}
            </View>
            {/* Blockers / Issues */}
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-sm font-bold text-gray-700 mb-1">Blockers / Issues</Text>
            <TextInput maxFontSizeMultiplier={1.3} style={{ minHeight: 44, minWidth: 44 }}
              className="border border-gray-300 rounded-xl p-3 mb-5 text-brand-text bg-gray-50 min-h-[80px]"
              multiline
              textAlignVertical="top"
              value={blockers}
              onChangeText={setBlockers}
              placeholder="Any blockers, safety issues, or delays? Leave blank if none."
            />

            {/* Photos */}
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-sm font-bold text-gray-700 mb-2">Site Photos</Text>
            {photoUrls.length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-3" contentContainerStyle={{ gap: 10 }}>
                {photoUrls.map((url, i) => (
                  <View key={`${url}-${i}`} className="relative">
                    <Image source={{ uri: url }} style={{ width: 96, height: 96, borderRadius: 12 }} />
                    <Pressable
                      onPress={() => setPhotoUrls(prev => prev.filter((_, idx) => idx !== i))}
                      className="absolute -top-2 -right-2 bg-gray-900/80 rounded-full p-1"
                    >
                      <Ionicons name="close" size={14} color="#fff" />
                    </Pressable>
                  </View>
                ))}
              </ScrollView>
            )}

            <View className="flex-row gap-3 mb-6">
              {/* Option 1: Live Real-time Camera */}
              <Pressable style={{ minHeight: 44, minWidth: 44 }}
                onPress={() => setShowPhotoModal(true)}
                disabled={photoUploading || loading || !selectedProjectId}
                className="flex-1 border border-orange-200 bg-orange-50/80 rounded-xl py-3.5 items-center justify-center flex-row active:bg-orange-100"
              >
                <Ionicons name="camera" size={18} color="#F97316" />
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-brand-orange text-xs font-bold ml-1.5">📸 Live Camera</Text>
              </Pressable>

              {/* Option 2: Device Upload (Preserves exact 'Tap to attach photo' text for automated audit) */}
              <Pressable style={{ minHeight: 44, minWidth: 44 }}
                onPress={uploadPhoto}
                disabled={photoUploading || loading || !selectedProjectId}
                className="flex-1 border border-dashed border-gray-300 rounded-xl py-3.5 items-center justify-center flex-row active:bg-gray-50"
              >
                {photoUploading ? (
                  <ActivityIndicator color="#F97316" size="small" />
                ) : (
                  <>
                    <Ionicons name="cloud-upload-outline" size={18} color="#6B7280" />
                    <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-600 text-xs font-medium ml-1.5">Tap to attach photo</Text>
                  </>
                )}
              </Pressable>
            </View>

            <PhotoCaptureModal
              visible={showPhotoModal}
              onClose={() => setShowPhotoModal(false)}
              projectId={selectedProjectId || undefined}
              caption="Daily site report photo"
              title="Capture Site Photo"
              onPhotoUploaded={(url) => setPhotoUrls(prev => [...prev, url])}
            />

            {/* Submit */}
            <Pressable style={{ minHeight: 44, minWidth: 44 }}
              onPress={handleSubmit}
              disabled={loading || photoUploading}
              className={`py-4 rounded-xl items-center ${loading ? 'bg-orange-300' : 'bg-brand-orange'}`}
            >
              {loading ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-white font-bold text-base">Submit Report</Text>
              )}
            </Pressable>

          </View>
        </ScrollView>
      )}

      {/* Add Material Used Modal */}
      <Modal visible={matModalOpen} transparent animationType="fade" onRequestClose={() => setMatModalOpen(false)}>
        <ModalViewport>
          <View className="bg-white w-full max-w-md rounded-2xl p-5 shadow-xl">
            <View className="flex-row items-center justify-between mb-4">
              <Text className="text-lg font-bold text-gray-800">Log Material Used</Text>
              <Pressable onPress={() => setMatModalOpen(false)} style={{ minHeight: 40, minWidth: 40 }} className="items-center justify-center">
                <Ionicons name="close" size={22} color="#6B7280" />
              </Pressable>
            </View>

            <Text className="text-xs font-bold text-gray-500 uppercase mb-2">Quick Select Material</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" className="mb-3">
              {projectMaterials.map(m => (
                <Pressable
                  key={m.name}
                  onPress={() => { setMatName(m.name); setMatUnit(m.unit); }}
                  className={`mr-2 px-3 py-1.5 rounded-full border ${matName === m.name ? 'bg-brand-orange border-brand-orange' : 'bg-gray-50 border-gray-200'}`}
                >
                  <Text className={`text-xs font-semibold ${matName === m.name ? 'text-white' : 'text-gray-700'}`}>{m.name}</Text>
                </Pressable>
              ))}
            </ScrollView>

            <Text className="text-xs font-bold text-gray-700 mb-1">Material Name</Text>
            <TextInput
              value={matName}
              onChangeText={setMatName}
              placeholder="e.g. Cement (50kg Bag)"
              className="border border-gray-200 rounded-xl p-3 bg-gray-50 mb-3 text-sm"
            />

            <View className="flex-row gap-3 mb-4">
              <View className="flex-1">
                <Text className="text-xs font-bold text-gray-700 mb-1">Quantity</Text>
                <TextInput
                  value={matQty}
                  onChangeText={setMatQty}
                  keyboardType="numeric"
                  placeholder="e.g. 12"
                  className="border border-gray-200 rounded-xl p-3 bg-gray-50 text-sm"
                />
              </View>
              <View className="flex-1">
                <Text className="text-xs font-bold text-gray-700 mb-1">Unit</Text>
                <TextInput
                  value={matUnit}
                  onChangeText={setMatUnit}
                  placeholder="bags, cubes..."
                  className="border border-gray-200 rounded-xl p-3 bg-gray-50 text-sm"
                />
              </View>
            </View>

            <Pressable
              onPress={() => {
                const qtyNum = Number(matQty);
                if (!matName.trim() || !Number.isFinite(qtyNum) || qtyNum <= 0) {
                  notify('Invalid input', 'Enter a material name and quantity greater than zero.');
                  return;
                }
                setMaterialsUsed(prev => [...prev, { name: matName.trim(), qty: qtyNum, unit: matUnit.trim() || 'units' }]);
                setMatName('');
                setMatQty('');
                setMatUnit('units');
                setMatModalOpen(false);
              }}
              className="bg-brand-orange py-3.5 rounded-xl items-center"
            >
              <Text className="text-white font-bold">Add to Report</Text>
            </Pressable>
          </View>
        </ModalViewport>
      </Modal>
    </View>
  );
}
