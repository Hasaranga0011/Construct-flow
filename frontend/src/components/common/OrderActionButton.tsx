import React from 'react';
import { Pressable, Text, ActivityIndicator } from 'react-native';

type ActionType = 'approve' | 'reject' | 'deliver' | 'receive';

type OrderActionButtonProps = {
  type: ActionType;
  onPress: () => void;
  loading?: boolean;
};

export function OrderActionButton({ type, onPress, loading }: OrderActionButtonProps) {
  const getStyle = () => {
    switch (type) {
      case 'approve': return { bg: 'bg-green-100', text: 'text-green-700', label: 'Approve' };
      case 'reject': return { bg: 'bg-white border border-red-500', text: 'text-red-600', label: 'Reject' };
      case 'deliver': return { bg: 'bg-brand-orange', text: 'text-white', label: 'Mark Delivered' };
      case 'receive': return { bg: 'bg-green-500', text: 'text-white', label: 'Confirm Received' };
      default: return { bg: 'bg-gray-100', text: 'text-gray-700', label: 'Action' };
    }
  };

  const { bg, text, label } = getStyle();

  return (
    <Pressable
      onPress={onPress}
      disabled={loading}
      style={{ minHeight: 36, height: 36, minWidth: 80 }}
      className={`rounded-lg items-center justify-center px-3 ${bg} ${loading ? 'opacity-50' : ''}`}
    >
      {loading ? (
        <ActivityIndicator size="small" color={type === 'deliver' || type === 'receive' ? '#FFFFFF' : '#F97316'} />
      ) : (
        <Text numberOfLines={1} className={`text-xs font-bold ${text}`}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}
