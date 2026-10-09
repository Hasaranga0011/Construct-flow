import React, { useEffect, useState } from 'react';
import { Keyboard, Modal, Pressable, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Bounds = { x: number; y: number; width: number; height: number };
/** Field-width portal: independent of ancestor overflow, bounded above the keyboard. */
export function AnchoredOverlay({ anchor, visible, onClose, children }: {
  anchor: React.RefObject<View | null>; visible: boolean; onClose: () => void; children: React.ReactNode;
}) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [bounds, setBounds] = useState<Bounds | null>(null);
  const [keyboardTop, setKeyboardTop] = useState(height);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', e => setKeyboardTop(e.endCoordinates.screenY));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardTop(height));
    return () => { show.remove(); hide.remove(); };
  }, [height]);
  useEffect(() => {
    if (!visible) { setBounds(null); return; }
    const frame = requestAnimationFrame(() => anchor.current?.measureInWindow((x, y, w, h) => setBounds({ x, y, width: w, height: h })));
    return () => cancelAnimationFrame(frame);
  }, [visible, width, height, keyboardTop, anchor]);
  if (!visible || !bounds) return null;
  const bottom = Math.min(height - insets.bottom, keyboardTop) - 16;
  const topLimit = insets.top + 16;
  const below = bottom - bounds.y - bounds.height - 4;
  const above = bounds.y - topLimit - 4;
  const useAbove = below < Math.min(240, above);
  const maxHeight = Math.max(44, Math.min(300, height * 0.85, useAbove ? above : below));
  const overlayWidth = Math.min(bounds.width, width - 32);
  return <Modal transparent visible animationType="none" onRequestClose={onClose}>
    <Pressable accessibilityLabel="Dismiss options" onPress={onClose} style={[{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 }, { minHeight: 44, minWidth: 44 }]} />
    <View accessibilityViewIsModal style={{ position: 'absolute', left: Math.max(16, Math.min(bounds.x, width - overlayWidth - 16)), width: overlayWidth, maxHeight,
      ...(useAbove ? { bottom: Math.max(height - bounds.y + 4, height - bottom) } : { top: Math.max(topLimit, Math.min(bounds.y + bounds.height + 4, bottom - maxHeight)) }) }}
      className="bg-white rounded-lg border border-gray-200 shadow-lg overflow-hidden">
      {children}
    </View>
  </Modal>;
}
