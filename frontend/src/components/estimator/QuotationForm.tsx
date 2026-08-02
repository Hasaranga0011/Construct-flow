import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { api } from '../../lib/api';
import toast from 'react-hot-toast';

export const QuotationForm = ({ onEstimateCreated = () => {} }: { onEstimateCreated?: () => void }) => {
  const [projectType, setProjectType] = useState('Residential');
  const [squareFootage, setSquareFootage] = useState('');
  const [location, setLocation] = useState('Colombo');
  const [qualityTier, setQualityTier] = useState('Standard');
  const [isGenerating, setIsGenerating] = useState(false);

  const cycleOption = (current: string, options: string[], setter: (v: string) => void) => {
    const idx = options.indexOf(current);
    setter(options[(idx + 1) % options.length]);
  };

  const handleGenerate = async () => {
    if (!squareFootage || isNaN(Number(squareFootage))) {
      toast.error('Please enter a valid square footage.');
      return;
    }

    setIsGenerating(true);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData?.session) throw new Error('Not logged in');

      // Map location to location_index
      const locMap: Record<string, number> = { 'Colombo': 1.5, 'Kandy': 1.1, 'Galle': 1.2, 'Other': 0.9 };
      const location_index = locMap[location] || 1.0;

      // Call via standardized API interface as per prompt
      const aiData = await api.post('/estimations/predict', {
        project_name: `${projectType} in ${location}`,
        square_footage: Number(squareFootage),
        num_floors: projectType === 'Commercial' ? 4 : projectType === 'Industrial' ? 2 : 1,
        material_quality: qualityTier,
        location_index: location_index
      });

      const estimatedCost = aiData.estimated_cost;
      const confidence = aiData.confidence_score;

      toast.success(`AI Estimate Generated: Rs. ${(estimatedCost / 1000000).toFixed(2)}M\nConfidence: ${confidence}%`, { duration: 4000 });
      setSquareFootage('');
      onEstimateCreated();
    } catch (error: any) {
      toast.error(error.message || 'Failed to generate estimate');
    } finally {
      setIsGenerating(false);
    }
  };
  return (
    <View className="bg-white rounded-lg p-6 shadow-sm border border-gray-100 mb-6">
      <View className="flex-row justify-between items-start mb-6">
        <View>
          <Text className="text-lg font-bold text-brand-text mb-1">Project Estimate Generator</Text>
          <Text className="text-brand-text-muted text-xs">Configure parameters for the AI model</Text>
        </View>
        <View className="flex-row items-center bg-orange-100 px-3 py-1.5 rounded-full">
          <Ionicons name="flash" size={14} color="#F97316" className="mr-1" />
          <Text className="text-brand-orange text-xs font-bold">AI Assisted</Text>
        </View>
      </View>

      <View className="flex-row flex-wrap -mx-3">
        <View className="w-1/2 px-3 mb-4">
          <Text className="text-gray-500 text-xs font-semibold mb-2">Project Type</Text>
          <Pressable 
            onPress={() => cycleOption(projectType, ['Residential', 'Commercial', 'Industrial'], setProjectType)}
            className="border border-gray-200 rounded-lg bg-gray-50 px-4 py-3 flex-row justify-between items-center"
          >
            <Text className="text-brand-text text-sm">{projectType}</Text>
            <Ionicons name="swap-vertical" size={16} color="#9CA3AF" />
          </Pressable>
        </View>

        <View className="w-1/2 px-3 mb-4">
          <Text className="text-gray-500 text-xs font-semibold mb-2">Square Footage (sq.ft)</Text>
          <View className="border border-gray-200 rounded-lg px-4 py-2.5">
            <TextInput 
              placeholder="e.g. 2400"
              placeholderTextColor="#9CA3AF"
              className="text-brand-text text-sm"
              keyboardType="numeric"
              value={squareFootage}
              onChangeText={setSquareFootage}
            />
          </View>
        </View>

        <View className="w-1/2 px-3 mb-4">
          <Text className="text-gray-500 text-xs font-semibold mb-2">Location</Text>
          <Pressable 
            onPress={() => cycleOption(location, ['Colombo', 'Kandy', 'Galle', 'Other'], setLocation)}
            className="border border-gray-200 rounded-lg bg-gray-50 px-4 py-3 flex-row justify-between items-center"
          >
            <Text className="text-brand-text text-sm">{location}</Text>
            <Ionicons name="swap-vertical" size={16} color="#9CA3AF" />
          </Pressable>
        </View>

        <View className="w-1/2 px-3 mb-4">
          <Text className="text-gray-500 text-xs font-semibold mb-2">Quality Tier</Text>
          <Pressable 
            onPress={() => cycleOption(qualityTier, ['Standard', 'Premium', 'Luxury'], setQualityTier)}
            className="border border-gray-200 rounded-lg bg-gray-50 px-4 py-3 flex-row justify-between items-center"
          >
            <Text className="text-brand-text text-sm">{qualityTier}</Text>
            <Ionicons name="swap-vertical" size={16} color="#9CA3AF" />
          </Pressable>
        </View>
      </View>

      <View className="flex-row justify-end mt-2">
        <Pressable 
          onPress={handleGenerate}
          disabled={isGenerating}
          className={`px-6 py-3 rounded-lg flex-row items-center ${isGenerating ? 'bg-gray-400' : 'bg-brand-orange'}`}
        >
          {isGenerating ? (
            <ActivityIndicator size="small" color="#ffffff" className="mr-2" />
          ) : (
            <Ionicons name="settings-sharp" size={16} color="#ffffff" className="mr-2" />
          )}
          <Text className="text-white font-semibold text-sm">
            {isGenerating ? 'Generating...' : 'Generate Estimate'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
};
