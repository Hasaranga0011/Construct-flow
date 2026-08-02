import React from 'react';
import { View, Text, ScrollView } from 'react-native';
import { FontAwesome5, Ionicons } from '@expo/vector-icons';

const MOCK_MILESTONES = [
  { id: 1, title: 'Site Clearance & Preparation', date: 'Oct 01, 2026', status: 'completed' },
  { id: 2, title: 'Foundation & Substructure', date: 'Oct 15, 2026', status: 'completed' },
  { id: 3, title: 'Superstructure (Ground Floor)', date: 'Nov 10, 2026', status: 'completed' },
  { id: 4, title: 'Superstructure (First Floor)', date: 'Dec 05, 2026', status: 'in-progress', countdown: '5 days left' },
  { id: 5, title: 'Roofing & Truss Work', date: 'Dec 20, 2026', status: 'pending' },
  { id: 6, title: 'MEP First Fix', date: 'Jan 10, 2027', status: 'pending' },
];

export const ClientMilestoneTimeline = () => {
  return (
    <View className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 flex-1 min-h-[300px]">
      <View className="flex-row justify-between items-center mb-6">
        <View>
          <Text className="text-lg font-bold text-brand-text mb-1">Project Milestones</Text>
          <Text className="text-gray-500 text-xs">Overall completion timeline</Text>
        </View>
        <View className="bg-orange-50 px-3 py-1 rounded-full">
          <Text className="text-brand-orange text-xs font-bold">55% Done</Text>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} className="pr-2">
        {MOCK_MILESTONES.map((milestone, index) => {
          const isLast = index === MOCK_MILESTONES.length - 1;
          const isCompleted = milestone.status === 'completed';
          const isInProgress = milestone.status === 'in-progress';
          
          return (
            <View key={milestone.id} className="flex-row">
              {/* Timeline Line & Dot */}
              <View className="items-center mr-4 w-6">
                <View 
                  className={`w-6 h-6 rounded-full items-center justify-center z-10 ${
                    isCompleted ? 'bg-brand-success' : 
                    isInProgress ? 'bg-brand-orange' : 'bg-gray-200'
                  }`}
                >
                  {isCompleted && <Ionicons name="checkmark" size={12} color="white" />}
                  {isInProgress && <View className="w-2 h-2 rounded-full bg-white animate-pulse" />}
                </View>
                {!isLast && (
                  <View 
                    className={`w-0.5 flex-1 my-1 ${
                      isCompleted ? 'bg-brand-success opacity-50' : 'bg-gray-200'
                    }`}
                  />
                )}
              </View>
              
              {/* Content */}
              <View className="flex-1 pb-8">
                <Text className={`font-bold text-base mb-1 ${
                  isCompleted ? 'text-brand-text' : 
                  isInProgress ? 'text-brand-orange' : 'text-gray-400'
                }`}>
                  {milestone.title}
                </Text>
                
                <View className="flex-row items-center justify-between">
                  <Text className={`text-sm ${isCompleted || isInProgress ? 'text-gray-600' : 'text-gray-400'}`}>
                    {milestone.date}
                  </Text>
                  
                  {isInProgress && milestone.countdown && (
                    <View className="bg-orange-50 border border-brand-orange px-2 py-0.5 rounded flex-row items-center">
                      <Ionicons name="time-outline" size={12} color="#F97316" style={{ marginRight: 4 }} />
                      <Text className="text-brand-orange text-[10px] font-bold uppercase">{milestone.countdown}</Text>
                    </View>
                  )}
                </View>
              </View>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
};
