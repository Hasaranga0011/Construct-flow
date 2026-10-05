import { useWindowDimensions } from 'react-native';

export function useResponsive() {
  const { width, height, fontScale } = useWindowDimensions();
  return { width, height, fontScale, isPhone: width < 640,
    isTablet: width >= 640 && width < 1024, isMobile: width < 1024,
    isDesktop: width >= 1024, isLandscape: width > height };
}
