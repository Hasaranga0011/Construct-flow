import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { api } from '../../lib/api';
import { toast } from '../../lib/toast';
import { sendSystemNotification } from '../../utils/notifications';

export const QuotationForm = ({ onEstimateCreated = () => {} }: { onEstimateCreated?: () => void }) => {
  const [projectType, setProjectType] = useState('Residential');
  const [squareFootage, setSquareFootage] = useState('');
  const [numFloors, setNumFloors] = useState('');
  const [location, setLocation] = useState('Colombo');
  const [qualityTier, setQualityTier] = useState('Standard');
  const [siteCondition, setSiteCondition] = useState('Flat');
  const [structureType, setStructureType] = useState('RCC frame');
  const [flooringTier, setFlooringTier] = useState('Standard');
  const [sanitaryTier, setSanitaryTier] = useState('Standard');
  const [electricalTier, setElectricalTier] = useState('Standard');
  const [timeline, setTimeline] = useState('Standard');
  const [isGenerating, setIsGenerating] = useState(false);

  const cycleOption = (current: string, options: string[], setter: (v: string) => void) => {
    const idx = options.indexOf(current);
    setter(options[(idx + 1) % options.length]);
  };

  const handleGenerate = async () => {
    if (!squareFootage || !Number.isFinite(Number(squareFootage)) || Number(squareFootage) <= 0) {
      toast.error('Please enter a valid square footage.');
      return;
    }
    if (!numFloors || !Number.isInteger(Number(numFloors)) || Number(numFloors) <= 0) {
      toast.error('Please enter a valid number of floors.');
      return;
    }

    setIsGenerating(true);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData?.session) throw new Error('Not logged in');

      // Call the real ML model
      const aiData = await api.post('/ai/predict-cost', {
        square_footage: Number(squareFootage),
        num_floors: Number(numFloors),
        location,
        project_type: projectType,
        quality_tier: qualityTier,
        site_condition: siteCondition,
        structure_type: structureType,
        finishing_flooring: flooringTier,
        finishing_sanitary: sanitaryTier,
        finishing_electrical: electricalTier,
        target_timeline: timeline
      });

      const estimatedCost = aiData.estimated_cost;
      const confidence = aiData.confidence_score;
      const contributions = aiData.feature_contributions;

      // Save estimation to DB using the generic CRUD route, storing context in project_name
      const projectNamePayload = JSON.stringify({
        title: `${projectType} in ${location}`,
        inputs: aiData.features_used,
        contributions: contributions
      });

      await api.post('/estimations', {
        project_name: projectNamePayload,
        estimated_cost: estimatedCost,
        status: 'Pending',
        confidence_score: confidence
      });

      toast.success(`AI Estimate Generated: Rs. ${(estimatedCost / 1000000).toFixed(2)}M\nConfidence: ${confidence == null ? 'Not validated' : `${confidence}%`}`);

      // Real-time Notification Dispatch
      await sendSystemNotification(
        'AI Estimate Generated',
        `A new ${projectType} project estimate for Rs. ${(estimatedCost / 1000000).toFixed(2)}M was generated and is pending review.`,
        'Admin'
      );

      setSquareFootage('');
      setNumFloors('');
      onEstimateCreated();
    } catch (error: any) {
      toast.error(error.message || 'Failed to generate estimate');
    } finally {
      setIsGenerating(false);
    }
  };
  return (
    <View className="bg-white rounded-lg p-6 shadow-sm border border-gray-100 mb-6">
      <View className="flex-row flex-wrap gap-3 justify-between items-start mb-6">
        <View>
          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-lg font-bold text-brand-text mb-1">Project Estimate Generator</Text>
          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-brand-text-muted text-xs">Configure parameters for the AI model</Text>
        </View>
        <View className="flex-row items-center bg-orange-100 px-3 py-1.5 rounded-full">
          <Ionicons name="flash" size={14} color="#F97316" className="mr-1" />
          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-brand-orange text-xs font-bold">AI Assisted</Text>
        </View>
      </View>

      <View className="flex-row flex-wrap -mx-3">
        <View className="w-full md:w-1/3 px-3 mb-4">
          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500 text-xs font-semibold mb-2">Project Type</Text>
          <Pressable style={{ minHeight: 44, minWidth: 44 }} onPress={() => cycleOption(projectType, ['Residential House', 'Commercial Building', 'Apartment Complex', 'Warehouse', 'Road Construction', 'Renovation'], setProjectType)} className="border border-gray-200 rounded-lg bg-gray-50 px-4 py-3 flex-row justify-between items-center">
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-brand-text text-sm truncate flex-1">{projectType}</Text>
            <Ionicons name="swap-vertical" size={16} color="#9CA3AF" />
          </Pressable>
        </View>

        <View className="w-full md:w-1/3 px-3 mb-4">
          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500 text-xs font-semibold mb-2">Location</Text>
          <Pressable style={{ minHeight: 44, minWidth: 44 }} onPress={() => cycleOption(location, ['Colombo', 'Gampaha', 'Kandy', 'Galle', 'Matara', 'Kurunegala', 'Ratnapura', 'Anuradhapura', 'Jaffna', 'Trincomalee'], setLocation)} className="border border-gray-200 rounded-lg bg-gray-50 px-4 py-3 flex-row justify-between items-center">
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-brand-text text-sm truncate flex-1">{location}</Text>
            <Ionicons name="swap-vertical" size={16} color="#9CA3AF" />
          </Pressable>
        </View>

        <View className="w-full md:w-1/3 px-3 mb-4">
          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500 text-xs font-semibold mb-2">Square Footage (sq.ft)</Text>
          <View className="border border-gray-200 rounded-lg px-4 py-2.5">
            <TextInput maxFontSizeMultiplier={1.3} style={{ minHeight: 44, minWidth: 44 }} placeholder="e.g. 2400" placeholderTextColor="#9CA3AF" className="text-brand-text text-sm" keyboardType="numeric" value={squareFootage} onChangeText={setSquareFootage} />
          </View>
        </View>

        <View className="w-full md:w-1/4 px-3 mb-4">
          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500 text-xs font-semibold mb-2">Num Floors</Text>
          <View className="border border-gray-200 rounded-lg px-4 py-2.5">
            <TextInput maxFontSizeMultiplier={1.3} style={{ minHeight: 44, minWidth: 44 }} placeholder="e.g. 2" placeholderTextColor="#9CA3AF" className="text-brand-text text-sm" keyboardType="numeric" value={numFloors} onChangeText={setNumFloors} />
          </View>
        </View>

        <View className="w-full md:w-1/4 px-3 mb-4">
          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500 text-xs font-semibold mb-2">Site Condition</Text>
          <Pressable style={{ minHeight: 44, minWidth: 44 }} onPress={() => cycleOption(siteCondition, ['Flat', 'Sloped', 'Requires Excavation/Piling'], setSiteCondition)} className="border border-gray-200 rounded-lg bg-gray-50 px-4 py-3 flex-row justify-between items-center">
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-brand-text text-xs truncate flex-1">{siteCondition}</Text>
            <Ionicons name="swap-vertical" size={16} color="#9CA3AF" />
          </Pressable>
        </View>

        <View className="w-full md:w-1/4 px-3 mb-4">
          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500 text-xs font-semibold mb-2">Structure Type</Text>
          <Pressable style={{ minHeight: 44, minWidth: 44 }} onPress={() => cycleOption(structureType, ['RCC frame', 'Load-bearing', 'Steel'], setStructureType)} className="border border-gray-200 rounded-lg bg-gray-50 px-4 py-3 flex-row justify-between items-center">
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-brand-text text-xs truncate flex-1">{structureType}</Text>
            <Ionicons name="swap-vertical" size={16} color="#9CA3AF" />
          </Pressable>
        </View>

        <View className="w-full md:w-1/4 px-3 mb-4">
          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500 text-xs font-semibold mb-2">Target Timeline</Text>
          <Pressable style={{ minHeight: 44, minWidth: 44 }} onPress={() => cycleOption(timeline, ['Standard', 'Rushed'], setTimeline)} className="border border-gray-200 rounded-lg bg-gray-50 px-4 py-3 flex-row justify-between items-center">
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-brand-text text-xs truncate flex-1">{timeline}</Text>
            <Ionicons name="swap-vertical" size={16} color="#9CA3AF" />
          </Pressable>
        </View>

        {/* Finishes section */}
        <View className="w-full mt-2 mb-2 px-3">
          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-700 font-bold text-sm">Finishing Quality Levels</Text>
          <View className="h-[1px] bg-gray-100 my-2" />
        </View>

        <View className="w-full md:w-1/4 px-3 mb-4">
          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500 text-xs font-semibold mb-2">Overall Quality</Text>
          <Pressable style={{ minHeight: 44, minWidth: 44 }} onPress={() => cycleOption(qualityTier, ['Standard', 'Premium', 'Luxury'], setQualityTier)} className="border border-gray-200 rounded-lg bg-gray-50 px-4 py-3 flex-row justify-between items-center">
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-brand-text text-xs truncate flex-1">{qualityTier}</Text>
            <Ionicons name="swap-vertical" size={16} color="#9CA3AF" />
          </Pressable>
        </View>
        <View className="w-full md:w-1/4 px-3 mb-4">
          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500 text-xs font-semibold mb-2">Flooring</Text>
          <Pressable style={{ minHeight: 44, minWidth: 44 }} onPress={() => cycleOption(flooringTier, ['Standard', 'Premium', 'Luxury'], setFlooringTier)} className="border border-gray-200 rounded-lg bg-gray-50 px-4 py-3 flex-row justify-between items-center">
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-brand-text text-xs truncate flex-1">{flooringTier}</Text>
            <Ionicons name="swap-vertical" size={16} color="#9CA3AF" />
          </Pressable>
        </View>
        <View className="w-full md:w-1/4 px-3 mb-4">
          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500 text-xs font-semibold mb-2">Sanitaryware</Text>
          <Pressable style={{ minHeight: 44, minWidth: 44 }} onPress={() => cycleOption(sanitaryTier, ['Standard', 'Premium', 'Luxury'], setSanitaryTier)} className="border border-gray-200 rounded-lg bg-gray-50 px-4 py-3 flex-row justify-between items-center">
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-brand-text text-xs truncate flex-1">{sanitaryTier}</Text>
            <Ionicons name="swap-vertical" size={16} color="#9CA3AF" />
          </Pressable>
        </View>
        <View className="w-full md:w-1/4 px-3 mb-4">
          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500 text-xs font-semibold mb-2">Electrical</Text>
          <Pressable style={{ minHeight: 44, minWidth: 44 }} onPress={() => cycleOption(electricalTier, ['Standard', 'Premium', 'Luxury'], setElectricalTier)} className="border border-gray-200 rounded-lg bg-gray-50 px-4 py-3 flex-row justify-between items-center">
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-brand-text text-xs truncate flex-1">{electricalTier}</Text>
            <Ionicons name="swap-vertical" size={16} color="#9CA3AF" />
          </Pressable>
        </View>
      </View>

      <View className="flex-row justify-end mt-2">
        <Pressable style={{ minHeight: 44, minWidth: 44 }}
          onPress={handleGenerate}
          disabled={isGenerating}
          className={`px-6 py-3 rounded-lg flex-row items-center ${isGenerating ? 'bg-gray-400' : 'bg-brand-orange'}`}
        >
          {isGenerating ? (
            <ActivityIndicator size="small" color="#ffffff" className="mr-2" />
          ) : (
            <Ionicons name="settings-sharp" size={16} color="#ffffff" className="mr-2" />
          )}
          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-white font-semibold text-sm">
            {isGenerating ? 'Generating...' : 'Generate Estimate'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
};
