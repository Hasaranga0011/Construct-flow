import React, { useEffect } from 'react';
import { ViewStyle, StyleProp } from 'react-native';
import Animated, { 
  useSharedValue, 
  useAnimatedStyle, 
  withTiming, 
  withDelay, 
  withSpring,
  Easing 
} from 'react-native-reanimated';

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
  const opacity = useSharedValue(0);
  const translate = useSharedValue(50);

  useEffect(() => {
    // Fade in
    opacity.value = withDelay(
      delay, 
      withTiming(1, { duration, easing: Easing.out(Easing.exp) })
    );

    // Slide in
    translate.value = withDelay(
      delay,
      withSpring(0, {
        damping: 15,
        stiffness: 100,
        mass: 1
      })
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => {
    let transform = [];
    
    switch (direction) {
      case 'up':
        transform.push({ translateY: translate.value });
        break;
      case 'down':
        transform.push({ translateY: -translate.value });
        break;
      case 'left':
        transform.push({ translateX: translate.value });
        break;
      case 'right':
        transform.push({ translateX: -translate.value });
        break;
    }

    return {
      opacity: opacity.value,
      transform,
    };
  });

  return (
    <Animated.View style={[animatedStyle, style]} className={className}>
      {children}
    </Animated.View>
  );
};
