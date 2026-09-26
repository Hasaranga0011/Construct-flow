import { useWindowDimensions, Platform } from 'react-native';

export function useResponsive() {
  const { width } = useWindowDimensions();
  const isMobile = Platform.OS !== 'web' || width < 1024;
  const isPhone = Platform.OS !== 'web' || width < 640;
  const isTablet = Platform.OS === 'web' && width >= 640 && width < 1024;
  const isDesktop = Platform.OS === 'web' && width >= 1024;
  
  return {
    isMobile,
    isPhone,
    isTablet,
    isDesktop,
    width
  };
}
