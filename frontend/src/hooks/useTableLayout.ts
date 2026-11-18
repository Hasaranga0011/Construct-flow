import { useCallback, useState } from 'react';
import { LayoutChangeEvent } from 'react-native';

/** Tables respond to their panel width, including inside desktop split views. */
export function useTableLayout(minimumWidth = 900) {
  const [width, setWidth] = useState(0);
  const onLayout = useCallback((event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width), []);
  return { isCompact: width < minimumWidth, onLayout };
}
