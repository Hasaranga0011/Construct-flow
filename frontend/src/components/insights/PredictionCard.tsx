import React from 'react';
import { View, Text, Pressable } from 'react-native';

export const PredictionCard = ({
  title,
  accuracy,
  project,
  prediction,
  predictionColorClass,
  factors,
  actionLabel
}: {
  title: string,
  accuracy: 'High Accuracy' | 'Medium Accuracy' | 'Low Accuracy',
  project: string,
  prediction: string,
  predictionColorClass: string,
  factors: string[],
  actionLabel: string
}) => {
  let accuracyBadgeColor = '';
  let accuracyTextColor = '';

  switch (accuracy) {
    case 'High Accuracy':
      accuracyBadgeColor = 'bg-[#DCFCE7]';
      accuracyTextColor = 'text-brand-success';
      break;
    case 'Medium Accuracy':
      accuracyBadgeColor = 'bg-[#FEF9C3]'; // yellow-100
      accuracyTextColor = 'text-[#A16207]'; // yellow-700
      break;
    case 'Low Accuracy':
      accuracyBadgeColor = 'bg-gray-100';
      accuracyTextColor = 'text-gray-600';
      break;
  }

  return (
    <View className="bg-white rounded-lg p-6 shadow-sm border border-gray-100 flex-1">
      {/* Header */}
      <View className="flex-row justify-between items-center mb-6">
        <Text className="text-lg font-bold text-brand-text">{title}</Text>
        <View className={`px-2 py-1 rounded ${accuracyBadgeColor}`}>
          <Text className={`text-[10px] font-bold uppercase ${accuracyTextColor}`}>{accuracy}</Text>
        </View>
      </View>

      {/* Main Content */}
      <View className="mb-6">
        <Text className="text-gray-500 text-xs font-semibold uppercase mb-1">Project</Text>
        <Text className="text-2xl font-bold text-brand-text mb-4">{project}</Text>
        
        <Text className="text-gray-500 text-xs font-semibold uppercase mb-1">AI Prediction</Text>
        <Text className={`text-lg font-bold ${predictionColorClass} mb-4`}>{prediction}</Text>

        <Text className="text-gray-500 text-xs font-semibold uppercase mb-2">Key Risk Factors</Text>
        {factors.map((factor, index) => (
          <View key={index} className="flex-row items-center mb-1.5">
            <View className="w-1.5 h-1.5 rounded-full bg-gray-400 mr-2" />
            <Text className="text-gray-600 text-sm">{factor}</Text>
          </View>
        ))}
      </View>

      {/* Footer Action */}
      <View className="mt-auto pt-4 border-t border-gray-100">
        <Pressable className="border border-brand-orange py-3 rounded-lg items-center justify-center">
          <Text className="text-brand-orange font-semibold text-sm">{actionLabel}</Text>
        </Pressable>
      </View>
    </View>
  );
};
