import React, { useEffect, useRef } from 'react';
import { ViewStyle, StyleProp, Animated, View, AccessibilityInfo } from 'react-native';

interface AnimatedCardProps {
  children: React.ReactNode;
  delay?: number;
  style?: StyleProp<ViewStyle>;
  className?: string;
  direction?: 'up' | 'down' | 'left' | 'right';
  duration?: number;
}

export const AnimatedCard: React.FC<AnimatedCardProps> = ({
  children,
  delay = 0,
  style,
  className,
  direction = 'up',
  duration = 220
}) => {
  const opacity = useRef(new Animated.Value(0)).current;
  const translate = useRef(new Animated.Value(12)).current;

  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled().then(reduced => {
      if (active && reduced) { clearTimeout(timer); opacity.stopAnimation(); translate.stopAnimation(); opacity.setValue(1); translate.setValue(0); }
    });
    const timer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration,
          useNativeDriver: true,
        }),
        Animated.timing(translate, {
          toValue: 0,
          duration,
          useNativeDriver: true,
        })
      ]).start();
    }, Math.min(delay, 80));

    return () => { active = false; clearTimeout(timer); };
  }, [delay, duration, opacity, translate]);

  let transform: any[] = [];
  switch (direction) {
    case 'up':
      transform.push({ translateY: translate });
      break;
    case 'down':
      transform.push({ translateY: Animated.multiply(translate, -1) });
      break;
    case 'left':
      transform.push({ translateX: translate });
      break;
    case 'right':
      transform.push({ translateX: Animated.multiply(translate, -1) });
      break;
  }

  return (
    <Animated.View style={[{ opacity, transform, minWidth: 0 }, style]}>
      <View className={className} style={{ flexGrow: 1, minWidth: 0 }}>{children}</View>
    </Animated.View>
  );
};
