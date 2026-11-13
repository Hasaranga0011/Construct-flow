import React from 'react';
import { Modal, View, Text, Pressable } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';

type Props = {
  visible: boolean;
  message: string;
  /** Login page the user should switch to. */
  switchTo: 'team' | 'partner';
  onClose: () => void;
};

/** Popup shown on a login form when the account belongs to the other portal. */
export default function AccessDeniedModal({ visible, message, switchTo, onClose }: Props) {
  const router = useRouter();
  const target = switchTo === 'team' ? '/team-login' : '/partner-login';
  const label = switchTo === 'team' ? 'Go to Team Login' : 'Go to Partner Login';

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.55)', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <View
          accessibilityRole="alert"
          style={{ width: '100%', maxWidth: 420, backgroundColor: '#fff', borderRadius: 20, padding: 24, alignItems: 'center' }}
        >
          <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: '#FEF3C7', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
            <Ionicons name="warning" size={34} color="#D97706" />
          </View>
          <Text maxFontSizeMultiplier={1.3} style={{ fontSize: 20, fontWeight: '800', color: '#111827', marginBottom: 8, textAlign: 'center' }}>
            Access Denied
          </Text>
          <Text maxFontSizeMultiplier={1.3} style={{ fontSize: 14, lineHeight: 20, color: '#4B5563', textAlign: 'center', marginBottom: 22 }}>
            {message}
          </Text>
          <Pressable
            onPress={() => { onClose(); router.replace(target as any); }}
            style={{ minHeight: 46, width: '100%', backgroundColor: '#F97316', borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}
          >
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>{label} →</Text>
          </Pressable>
          <Pressable
            onPress={onClose}
            style={{ minHeight: 46, width: '100%', backgroundColor: '#F3F4F6', borderRadius: 12, alignItems: 'center', justifyContent: 'center' }}
          >
            <Text style={{ color: '#374151', fontWeight: '700', fontSize: 15 }}>OK</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

