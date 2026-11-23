import { useEffect, useState } from 'react';
import { Platform, useWindowDimensions } from 'react-native';

/** Browser keyboards can shrink the visual viewport without resizing the page. */
export function useVisibleViewport() {
  const dimensions = useWindowDimensions();
  const [visible, setVisible] = useState<{height:number; width:number; top:number; left:number} | null>(null);
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined' || !window.visualViewport) return;
    const viewport = window.visualViewport;
    const update = () => setVisible({height:viewport.height, width:viewport.width, top:viewport.offsetTop, left:viewport.offsetLeft});
    update();
    viewport.addEventListener('resize', update);
    viewport.addEventListener('scroll', update);
    return () => {
      viewport.removeEventListener('resize', update);
      viewport.removeEventListener('scroll', update);
    };
  }, []);
  return {
    height:Math.min(dimensions.height, visible?.height ?? dimensions.height),
    width:Math.min(dimensions.width, visible?.width ?? dimensions.width),
    top:Math.max(0, visible?.top ?? 0),
    left:Math.max(0, visible?.left ?? 0),
  };
}
