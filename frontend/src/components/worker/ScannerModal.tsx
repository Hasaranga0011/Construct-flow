import React from 'react';
import { Modal, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ModalViewport } from '../common/ModalViewport';
import { QRScanner } from './QRScanner';

export function ScannerModal({ visible, onScan, onClose }: { visible: boolean; onScan: (data: string) => void | Promise<void>; onClose: () => void }) {
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
    <ModalViewport>
      <View style={{ width: '100%', maxWidth: 600, height: Math.min(height * 0.85, height - insets.top - insets.bottom - 32), minHeight: 0, overflow: 'hidden', borderRadius: 12, backgroundColor: '#000' }}>
        <QRScanner onScan={onScan} onClose={onClose} />
      </View>
    </ModalViewport>
  </Modal>;
}
