import React from 'react';
import { Platform } from 'react-native';
import { usePathname } from 'expo-router';
import Head from 'expo-router/head';
import { pageMetadata } from '@/utils/pageTitles';

export function PageMetadata() {
  const pathname = usePathname();
  const { title } = pageMetadata(pathname);
  if (Platform.OS !== 'web') return null;
  return <Head><title>{title}</title><meta name="application-name" content="ConstructAi" /></Head>;
}
