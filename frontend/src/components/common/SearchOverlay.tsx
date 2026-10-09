import React from 'react';
import { View } from 'react-native';

/** Native suggestions stay in the scroll/keyboard responder tree, without a focus-stealing modal. */
export function SearchOverlay({ children }: {
  anchor: React.RefObject<View | null>;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
