import React, { createContext, forwardRef, useContext } from 'react';
import { ScrollView, ScrollViewProps } from 'react-native';
import { usePathname } from 'expo-router';
import { contentWidth } from '@/utils/contentWidth';

const ContentDepth = createContext(false);

/** Bounds the first vertical scroll surface; nested lists and horizontal tables keep their own layout. */
export const ContentScrollView = forwardRef<ScrollView, ScrollViewProps>((props, ref) => {
  const path = usePathname();
  const nested = useContext(ContentDepth);
  const maxWidth = contentWidth(path);
  if (nested || props.horizontal || !maxWidth) return <ScrollView ref={ref} {...props} />;
  return <ScrollView ref={ref} {...props} testID={props.testID || 'page-content-scroll'}
    contentContainerStyle={[props.contentContainerStyle, { width: '100%', maxWidth, alignSelf: 'center', minWidth: 0 }]}>
    <ContentDepth.Provider value>{props.children}</ContentDepth.Provider>
  </ScrollView>;
});
ContentScrollView.displayName = 'ContentScrollView';
