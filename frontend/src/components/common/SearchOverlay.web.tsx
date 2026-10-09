import React, { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { View } from 'react-native';

/** Non-modal portal: escapes ancestor clipping/stacking without taking input focus. */
export function SearchOverlay({ anchor, children, onClose }: {
  anchor: React.RefObject<View | null>;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  const [bounds, setBounds] = useState<{ left: number; top: number; width: number } | null>(null);
  useLayoutEffect(() => {
    const element = anchor.current as unknown as HTMLElement | null;
    if (!element) return;
    const measure = () => {
      const rect = element.getBoundingClientRect();
      setBounds({ left: rect.left + window.scrollX, top: rect.bottom + window.scrollY, width: rect.width });
    };
    const outside = (event: PointerEvent) => {
      if (!element.contains(event.target as Node) && !panel.current?.contains(event.target as Node)) close.current();
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    window.addEventListener('resize', measure);
    document.addEventListener('scroll', measure, true);
    document.addEventListener('pointerdown', outside, true);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
      document.removeEventListener('scroll', measure, true);
      document.removeEventListener('pointerdown', outside, true);
    };
  }, [anchor]);
  if (!bounds) return null;
  return createPortal(<div ref={panel} style={{ position: 'absolute', ...bounds, height: 0, zIndex: 10000 }}>
    {children}
  </div>, document.body);
}
