import React from 'react';
import { View, useWindowDimensions } from 'react-native';

export const Toolbar = ({ children }: { children: React.ReactNode }) => {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  return (
    <View style={{ 
      flexDirection: isMobile ? 'column' : 'row',
      gap: 12,
      marginBottom: 24,
      zIndex: 50
    }}>
      {children}
    </View>
  );
};

export const ToolbarSearch = ({ children }: { children: React.ReactNode }) => {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  return (
    <View style={isMobile ? { width: '100%' } : { flex: 1, minWidth: 0, marginRight: 12 }}>
      {children}
    </View>
  );
};

export const ToolbarFilter = ({ children }: { children: React.ReactNode }) => {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  return (
    <View style={isMobile ? { width: '100%' } : { width: 220 }}>
      {children}
    </View>
  );
};
