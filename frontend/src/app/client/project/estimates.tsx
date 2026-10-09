import { getApiUrl } from '../../../lib/apiUrl';
import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TextInput, Pressable } from 'react-native';
import { TopNav } from '@/components/common/TopNav';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../context/AuthContext';

type Project = { id: string; name: string; location?: string | null };
type Estimation = { id: string; project_name: string; estimated_cost: number; confidence_score?: number | null; status: string; created_at: string };

const PROJECT_TYPES = ['Residential', 'Commercial', 'Industrial'];
const QUALITY_TIERS = ['Standard', 'Premium', 'Luxury'];

const formatCurrency = (amount: number) => `LKR ${Math.round(amount).toLocaleString('en-LK')}`;

export default function ClientProjectEstimatesPage() {
  const { user } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [estimations, setEstimations] = useState<Estimation[]>([]);
  const [projectId, setProjectId] = useState('');
  const [squareFootage, setSquareFootage] = useState('');
  const [projectType, setProjectType] = useState(PROJECT_TYPES[0]);
  const [qualityTier, setQualityTier] = useState(QUALITY_TIERS[0]);
  const [result, setResult] = useState<Estimation | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let isMounted = true;
    const loadData = async () => {
      if (!isMounted) return;
      setLoading(true);
      setError(null);
      try {
        const [projectResponse, estimationResponse] = await Promise.all([
          supabase.from('projects').select('id, name, location').eq('client_id', user.id).order('created_at', { ascending: false }),
          supabase.from('estimations').select('id, project_name, estimated_cost, confidence_score, status, created_at').order('created_at', { ascending: false }).limit(20),
        ]);
        if (projectResponse.error) throw projectResponse.error;
        if (estimationResponse.error) throw estimationResponse.error;
        if (isMounted) {
          const assignedProjects = (projectResponse.data || []) as Project[];
          setProjects(assignedProjects);
          if (!projectId && assignedProjects[0]) setProjectId(assignedProjects[0].id);
          setEstimations((estimationResponse.data || []) as Estimation[]);
        }
      } catch (loadError: any) {
        if (isMounted) setError(loadError.message || 'Failed to load estimates.');
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    loadData();
    return () => { isMounted = false; };
  }, [user, projectId]);

  const generateEstimate = async () => {
    const project = projects.find(item => item.id === projectId);
    const area = Number(squareFootage);
    if (!project || !Number.isFinite(area) || area <= 0) {
      setError('Select a project and enter a valid area in square feet.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const apiUrl = getApiUrl();
      const response = await fetch(`${apiUrl}/ai/predict-cost`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessionData.session?.access_token || ''}` },
        body: JSON.stringify({ square_footage: area, location: project.location || 'Other', project_type: projectType, quality_tier: qualityTier }),
      });
      const responseData = await response.json();
      if (!response.ok) throw new Error(responseData.detail || 'Estimate request failed.');
      const { data: saved, error: saveError } = await supabase.from('estimations').insert({ project_name: project.name, estimated_cost: responseData.estimated_cost, confidence_score: responseData.confidence_score, status: 'Pending' }).select('id, project_name, estimated_cost, confidence_score, status, created_at').single();
      if (saveError) throw saveError;
      setResult(saved as Estimation);
      setEstimations(current => [saved as Estimation, ...current]);
      setSquareFootage('');
    } catch (submitError: any) {
      setError(submitError.message || 'Failed to generate estimate.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View className="flex-1 bg-brand-light">
      <TopNav title="Client Project Estimates" showAction={false} />
      <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="px-6 py-3 text-sm text-amber-800 bg-amber-50">Prototype estimates use synthetic data. Accuracy is not validated; confirm costs before budgeting.</Text>
      <ScrollView keyboardShouldPersistTaps="handled" className="flex-1 p-6" showsVerticalScrollIndicator={false}>
        <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-2xl font-bold text-brand-text mb-6">Cost Estimates</Text>
        {error && <View className="bg-red-50 border border-red-200 rounded-xl p-4 mb-5"><Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-red-700">{error}</Text></View>}
        {loading ? <View className="bg-gray-100 rounded-2xl h-72 animate-pulse" /> : projects.length === 0 ? <View className="bg-white rounded-2xl border border-gray-100 p-10 items-center"><Ionicons name="calculator-outline" size={48} color="#D1D5DB" /><Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500 mt-4 text-center">No assigned project is available for an estimate.</Text></View> : <>
          <View className="bg-white rounded-2xl border border-gray-100 p-6 mb-6">
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-lg font-bold text-brand-text mb-5">Generate an Estimate</Text>
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-sm font-semibold text-gray-700 mb-2">Project</Text>
            <ScrollView keyboardShouldPersistTaps="handled" horizontal showsHorizontalScrollIndicator={false} className="mb-5">
              {projects.map(project => <Pressable style={{ minHeight: 44, minWidth: 44 }} key={project.id} onPress={() => setProjectId(project.id)} className={`px-4 py-2 rounded-full border mr-2 ${projectId === project.id ? 'bg-brand-orange border-brand-orange' : 'bg-white border-gray-300'}`}><Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className={projectId === project.id ? 'text-white font-bold' : 'text-gray-600'}>{project.name}</Text></Pressable>)}
            </ScrollView>
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-sm font-semibold text-gray-700 mb-2">Area (sq. ft.)</Text>
            <TextInput maxFontSizeMultiplier={1.3} style={{ minHeight: 44, minWidth: 44 }} value={squareFootage} onChangeText={setSquareFootage} keyboardType="numeric" placeholder="Enter project area" className="border border-gray-300 rounded-xl p-4 bg-gray-50 text-brand-text mb-5" />
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-sm font-semibold text-gray-700 mb-2">Project type</Text>
            <ScrollView keyboardShouldPersistTaps="handled" horizontal showsHorizontalScrollIndicator={false} className="mb-5">{PROJECT_TYPES.map(type => <Pressable style={{ minHeight: 44, minWidth: 44 }} key={type} onPress={() => setProjectType(type)} className={`px-4 py-2 rounded-full border mr-2 ${projectType === type ? 'bg-brand-orange border-brand-orange' : 'bg-white border-gray-300'}`}><Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className={projectType === type ? 'text-white font-bold' : 'text-gray-600'}>{type}</Text></Pressable>)}</ScrollView>
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-sm font-semibold text-gray-700 mb-2">Quality tier</Text>
            <ScrollView keyboardShouldPersistTaps="handled" horizontal showsHorizontalScrollIndicator={false} className="mb-6">{QUALITY_TIERS.map(tier => <Pressable style={{ minHeight: 44, minWidth: 44 }} key={tier} onPress={() => setQualityTier(tier)} className={`px-4 py-2 rounded-full border mr-2 ${qualityTier === tier ? 'bg-brand-orange border-brand-orange' : 'bg-white border-gray-300'}`}><Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className={qualityTier === tier ? 'text-white font-bold' : 'text-gray-600'}>{tier}</Text></Pressable>)}</ScrollView>
            <Pressable style={{ minHeight: 44, minWidth: 44 }} onPress={generateEstimate} disabled={submitting} className={`py-4 rounded-xl items-center ${submitting ? 'bg-orange-300' : 'bg-brand-orange'}`}><Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-white font-bold">{submitting ? 'Generating...' : 'Generate Estimate'}</Text></Pressable>
          </View>
          {result && <View className="bg-brand-orange rounded-2xl p-6 mb-6"><Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-white text-sm opacity-80">Latest estimate</Text><Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-white text-3xl font-bold mt-2">{formatCurrency(Number(result.estimated_cost))}</Text><Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-white mt-2">Confidence: {result.confidence_score == null ? 'Not validated' : `${result.confidence_score}%`}</Text></View>}
          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-lg font-bold text-brand-text mb-4">Estimate History</Text>
          {estimations.length === 0 ? <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500">No estimates have been generated.</Text> : estimations.map(estimation => <View key={estimation.id} className="bg-white border border-gray-100 rounded-xl p-5 mb-3"><View className="flex-row justify-between"><View><Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="font-bold text-brand-text">{estimation.project_name}</Text><Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-400 text-xs mt-1">{new Date(estimation.created_at).toLocaleDateString('en-GB')}</Text></View><Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-brand-orange font-bold">{formatCurrency(Number(estimation.estimated_cost))}</Text></View><Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500 text-xs mt-3">{estimation.status} · Confidence {estimation.confidence_score == null ? 'Not validated' : `${estimation.confidence_score}%`}</Text></View>)}
        </>}
      </ScrollView>
    </View>
  );
}
