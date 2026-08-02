import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { useColorScheme } from 'nativewind';

type ThemeContextType = {
  isDark: boolean;
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextType>({
  isDark: false,
  toggleTheme: () => {},
});

const THEME_KEY = '@cf_theme';

export const ThemeProvider = ({ children }: { children: React.ReactNode }) => {
  const [isDark, setIsDark] = useState(false);
  const { setColorScheme } = useColorScheme();

  // Load saved preference on mount
  useEffect(() => {
    AsyncStorage.getItem(THEME_KEY).then((val) => {
      const dark = val === 'dark';
      setIsDark(dark);
      setColorScheme(dark ? 'dark' : 'light');
      applyTheme(dark);
    });
  }, []);

  const applyTheme = (dark: boolean) => {
    if (Platform.OS === 'web') {
      try {
        const root = document.documentElement;
        if (dark) {
          root.classList.add('dark');
        } else {
          root.classList.remove('dark');
        }
      } catch {}
    }
  };

  const toggleTheme = () => {
    const next = !isDark;
    setIsDark(next);
    setColorScheme(next ? 'dark' : 'light');
    applyTheme(next);
    AsyncStorage.setItem(THEME_KEY, next ? 'dark' : 'light');
  };

  return (
    <ThemeContext.Provider value={{ isDark, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);
