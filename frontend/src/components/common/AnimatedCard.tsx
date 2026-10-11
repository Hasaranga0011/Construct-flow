import React, { useEffect, useRef } from 'react';
import { ViewStyle, StyleProp, Animated } from 'react-native';

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
  duration = 500
}) => {
  const opacity = useRef(new Animated.Value(0)).current;
  const translate = useRef(new Animated.Value(50)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.delay(delay),
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration,
          useNativeDriver: true,
        }),
        Animated.spring(translate, {
          toValue: 0,
          friction: 8,
          tension: 40,
          useNativeDriver: true,
        })
      ])
    ]).start();
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
    <Animated.View style={[{ opacity, transform }, style]} className={className}>
      {children}
    </Animated.View>
  );
};
