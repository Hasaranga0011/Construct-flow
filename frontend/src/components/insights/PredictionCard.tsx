import React from 'react';
import { View, Text, Pressable } from 'react-native';

/**
 * PredictionCard
 *
 * Displays a single AI prediction (cost or delay) with:
 *  - accuracy badge derived from a real metric (not a static string)
 *  - a one-line model explanation sentence
 *  - ranked factor bullets from real feature importance
 *  - an optional outline action button
 *
 * Props:
 *   title              — card heading
 *   accuracyScore      — 0-100 number (confidence or model accuracy %)
 *   project            — project name
 *   prediction         — human-readable prediction string
 *   predictionColorClass — Tailwind text color class
 *   factors            — ranked feature names (most important first)
 *   modelExplanation   — one sentence describing what the model used
 *   actionLabel        — label for the outline button
 *   onAction           — optional press handler
 */
export const PredictionCard = ({
  title,
  accuracyScore,
  project,
  prediction,
  predictionColorClass,
  factors,
  modelExplanation,
  actionLabel,
  onAction,
}: {
  title: string;
  accuracyScore?: number | null;
  project: string;
  prediction: string;
  predictionColorClass: string;
  factors: string[];
  modelExplanation?: string;
  actionLabel: string;
  onAction?: () => void;
}) => {
  // Derive badge from numeric score
  const accuracy: 'High Accuracy' | 'Medium Accuracy' | 'Low Accuracy' =
    accuracyScore == null
      ? 'Low Accuracy'
      : accuracyScore >= 75
      ? 'High Accuracy'
      : accuracyScore >= 50
      ? 'Medium Accuracy'
      : 'Low Accuracy';

  let accuracyBadgeColor = '';
  let accuracyTextColor = '';

  switch (accuracy) {
    case 'High Accuracy':
      accuracyBadgeColor = 'bg-[#DCFCE7]';
      accuracyTextColor = 'text-brand-success';
      break;
    case 'Medium Accuracy':
      accuracyBadgeColor = 'bg-[#FEF9C3]';
      accuracyTextColor = 'text-[#A16207]';
      break;
    case 'Low Accuracy':
      accuracyBadgeColor = 'bg-gray-100';
      accuracyTextColor = 'text-gray-600';
      break;
  }

  return (
    <View className="bg-white rounded-lg p-6 shadow-sm border border-gray-100 flex-1">
      {/* Header */}
      <View className="flex-row justify-between items-center mb-2">
        <Text className="text-lg font-bold text-brand-text">{title}</Text>
        <View className={`px-2 py-1 rounded ${accuracyBadgeColor}`}>
          <Text className={`text-[10px] font-bold uppercase ${accuracyTextColor}`}>
            {accuracy}
          </Text>
        </View>
      </View>

      {/* One-line model explanation */}
      {modelExplanation && (
        <Text className="text-gray-400 text-xs mb-5 leading-4">{modelExplanation}</Text>
      )}

      {/* Main Content */}
      <View className="mb-6">
        <Text className="text-gray-500 text-xs font-semibold uppercase mb-1">Project</Text>
        <Text className="text-2xl font-bold text-brand-text mb-4">{project}</Text>

        <Text className="text-gray-500 text-xs font-semibold uppercase mb-1">AI Prediction</Text>
        <Text className={`text-lg font-bold ${predictionColorClass} mb-4`}>{prediction}</Text>

        {factors.length > 0 && (
          <>
            <Text className="text-gray-500 text-xs font-semibold uppercase mb-2">
              Key Factors (ranked)
            </Text>
            {factors.map((factor, index) => (
              <View key={index} className="flex-row items-center mb-1.5">
                <View className="w-1.5 h-1.5 rounded-full bg-brand-orange mr-2" />
                <Text className="text-gray-600 text-sm">{factor}</Text>
              </View>
            ))}
          </>
        )}
      </View>

      {/* Footer Action */}
      <View className="mt-auto pt-4 border-t border-gray-100">
        <Pressable
          onPress={onAction}
          className="border border-brand-orange py-3 rounded-lg items-center justify-center"
        >
          <Text className="text-brand-orange font-semibold text-sm">{actionLabel}</Text>
        </Pressable>
      </View>
    </View>
  );
};
