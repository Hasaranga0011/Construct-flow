import React from 'react';
import { View, useWindowDimensions } from 'react-native';

export const Toolbar = ({ children, style, className = '' }: { children: React.ReactNode; style?: any; className?: string }) => {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  return (
    <View className={className} style={[{ 
      flexDirection: isMobile ? 'column' : 'row',
      alignItems: isMobile ? 'stretch' : 'center',
      gap: 12,
      minWidth: 0,
      flexWrap: 'wrap',
      zIndex: 50
    }, style]}>
      {children}
    </View>
  );
};

export const ToolbarSearch = ({ children, style, className = '' }: { children: React.ReactNode; style?: any; className?: string }) => {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  return (
    <View className={className} style={[{ width: isMobile ? '100%' : 320, maxWidth: '100%', minWidth: 0, flexShrink: 1 }, style]}>
      {children}
    </View>
  );
};

export const ToolbarFilter = ({ children, style, className = '' }: { children: React.ReactNode; style?: any; className?: string }) => {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  return (
    <View className={className} style={[{ width: isMobile ? '100%' : 220, maxWidth: '100%', minWidth: 0, flexShrink: 1 }, style]}>
      {children}
    </View>
  );
};
