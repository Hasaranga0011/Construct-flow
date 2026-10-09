 import React, { useEffect, useState } from 'react';
 import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
 import { useRouter } from 'expo-router';
 import { TopNav } from '@/components/common/TopNav';
 import { supabase } from '../../../../lib/supabase';
 
 type Project = { id: string; name: string };
 
 export default function AdminMaterialsCreatePage() {
	 const router = useRouter();
	 const [projects, setProjects] = useState<Project[]>([]);
	 const [projectId, setProjectId] = useState('');
	 const [name, setName] = useState('');
	 const [unit, setUnit] = useState('');
	 const [quantity, setQuantity] = useState('');
	 const [minQuantity, setMinQuantity] = useState('');
	 const [loading, setLoading] = useState(true);
	 const [submitting, setSubmitting] = useState(false);
	 const [error, setError] = useState<string | null>(null);
 
	 useEffect(() => {
		 let isMounted = true;
		 const loadProjects = async () => {
			 try {
				 const { data, error: projectError } = await supabase.from('projects').select('id, name').order('name');
				 if (projectError) throw projectError;
				 if (isMounted) setProjects((data || []) as Project[]);
			 } catch (loadError: any) {
				 if (isMounted) setError(loadError.message || 'Failed to load projects.');
			 } finally {
				 if (isMounted) setLoading(false);
			 }
		 };
		 loadProjects();
		 return () => { isMounted = false; };
	 }, []);
 
	 const handleSubmit = async () => {
		 const parsedQuantity = Number(quantity);
		 const parsedMinQuantity = Number(minQuantity);
		 if (!name.trim() || !unit.trim() || !projectId || !Number.isFinite(parsedQuantity) || parsedQuantity < 0 || !Number.isFinite(parsedMinQuantity) || parsedMinQuantity < 0) {
			 setError('Enter a name, unit, project, and valid non-negative quantity and minimum threshold.');
			 return;
		 }
 
		 setSubmitting(true);
		 setError(null);
		 try {
			 const { error: insertError } = await supabase.from('materials').insert({
				 name: name.trim(),
				 unit: unit.trim(),
				 current_stock: parsedQuantity,
				 minimum_threshold: parsedMinQuantity,
				 project_id: projectId,
			 });
			 if (insertError) throw insertError;
			 const message = 'Material created successfully.';
			if (Platform.OS === 'web') window.alert(message);
			else Alert.alert('Success', message);
			 router.back();
		 } catch (submitError: any) {
			 setError(submitError.message || 'Failed to create material.');
		 } finally {
			 setSubmitting(false);
		 }
	 };
 
	 return (
		 <View className="flex-1 bg-brand-light">
			 <TopNav title="Create Material" showAction={false} />
			 <ScrollView className="flex-1 p-6" keyboardShouldPersistTaps="handled">
				 <View className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 max-w-2xl w-full mx-auto">
					 <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xl font-bold text-brand-text mb-6">Material details</Text>
					 {error && <View className="bg-red-50 border border-red-200 rounded-lg p-3 mb-5"><Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-red-700">{error}</Text></View>}
					 {loading ? <View className="py-12 items-center"><ActivityIndicator color="#F97316" /></View> : <>
						 <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-sm font-semibold text-gray-700 mb-2">Material name *</Text>
						 <TextInput maxFontSizeMultiplier={1.3} style={{ minHeight: 44, minWidth: 44 }} value={name} onChangeText={setName} placeholder="Cement" className="border border-gray-300 rounded-xl p-4 bg-gray-50 text-brand-text mb-4" />
						 <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-sm font-semibold text-gray-700 mb-2">Unit *</Text>
						 <TextInput maxFontSizeMultiplier={1.3} style={{ minHeight: 44, minWidth: 44 }} value={unit} onChangeText={setUnit} placeholder="bags" className="border border-gray-300 rounded-xl p-4 bg-gray-50 text-brand-text mb-4" />
						 <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-sm font-semibold text-gray-700 mb-2">Project *</Text>
						 <ScrollView keyboardShouldPersistTaps="handled" horizontal showsHorizontalScrollIndicator={false} className="mb-4">
							 {projects.map(project => <Pressable style={{ minHeight: 44, minWidth: 44 }} key={project.id} onPress={() => setProjectId(project.id)} className={`px-4 py-2 rounded-full border mr-2 ${projectId === project.id ? 'bg-brand-orange border-brand-orange' : 'bg-white border-gray-300'}`}><Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className={projectId === project.id ? 'text-white font-bold' : 'text-gray-600'}>{project.name}</Text></Pressable>)}
						 </ScrollView>
						 {projects.length === 0 && <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500 mb-4">No projects are available for assignment.</Text>}
						 <View className="flex-row gap-4">
							 <View className="flex-1"><Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-sm font-semibold text-gray-700 mb-2">Quantity *</Text><TextInput maxFontSizeMultiplier={1.3} style={{ minHeight: 44, minWidth: 44 }} value={quantity} onChangeText={setQuantity} keyboardType="numeric" placeholder="0" className="border border-gray-300 rounded-xl p-4 bg-gray-50 text-brand-text mb-4" /></View>
							 <View className="flex-1"><Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-sm font-semibold text-gray-700 mb-2">Minimum *</Text><TextInput maxFontSizeMultiplier={1.3} style={{ minHeight: 44, minWidth: 44 }} value={minQuantity} onChangeText={setMinQuantity} keyboardType="numeric" placeholder="0" className="border border-gray-300 rounded-xl p-4 bg-gray-50 text-brand-text mb-4" /></View>
						 </View>
						 <Pressable style={{ minHeight: 44, minWidth: 44 }} onPress={handleSubmit} disabled={submitting} className={`mt-6 rounded-xl py-4 items-center ${submitting ? 'bg-orange-300' : 'bg-brand-orange'}`}><Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-white font-bold">{submitting ? 'Saving...' : 'Create material'}</Text></Pressable>
					 </>}
				 </View>
			 </ScrollView>
		 </View>
	 );
 }
