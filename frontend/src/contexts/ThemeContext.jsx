import { darken } from '../utils/colors';
import { createContext, useContext, useState, useEffect } from 'react';

const ThemeContext = createContext(null);

// Predefined color themes
export const presetThemes = {
  navy: {
    name: 'BizTrack Navy',
    primary: '#1e3a5f',
    primaryDark: '#162c47',
    primaryLight: '#4a6a8c',
    accent: '#f59e0b',
  },
  blue: {
    name: 'Ocean Blue',
    primary: '#2563eb', // blue-600
    primaryDark: '#1e40af', // blue-800
    primaryLight: '#3b82f6', // blue-500
    accent: '#06b6d4', // cyan-600
  },
  indigo: {
    name: 'Royal Indigo',
    primary: '#4f46e5', // indigo-600
    primaryDark: '#3730a3', // indigo-800
    primaryLight: '#6366f1', // indigo-500
    accent: '#8b5cf6', // violet-600
  },
  emerald: {
    name: 'Forest Emerald',
    primary: '#059669', // emerald-600
    primaryDark: '#065f46', // emerald-800
    primaryLight: '#10b981', // emerald-500
    accent: '#14b8a6', // teal-600
  },
  rose: {
    name: 'Rose Pink',
    primary: '#e11d48', // rose-600
    primaryDark: '#9f1239', // rose-800
    primaryLight: '#f43f5e', // rose-500
    accent: '#ec4899', // pink-600
  },
  amber: {
    name: 'Golden Amber',
    primary: '#d97706', // amber-600
    primaryDark: '#92400e', // amber-800
    primaryLight: '#f59e0b', // amber-500
    accent: '#eab308', // yellow-600
  },
  purple: {
    name: 'Royal Purple',
    primary: '#9333ea', // purple-600
    primaryDark: '#6b21a8', // purple-800
    primaryLight: '#a855f7', // purple-500
    accent: '#d946ef', // fuchsia-600
  },
  teal: {
    name: 'Tropical Teal',
    primary: '#0d9488', // teal-600
    primaryDark: '#115e59', // teal-800
    primaryLight: '#14b8a6', // teal-500
    accent: '#06b6d4', // cyan-600
  },
  slate: {
    name: 'Modern Slate',
    primary: '#475569', // slate-600
    primaryDark: '#1e293b', // slate-800
    primaryLight: '#64748b', // slate-500
    accent: '#0ea5e9', // sky-600
  },
};

export const ThemeProvider = ({ children }) => {
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem('biztrack-theme');
    return saved ? JSON.parse(saved) : presetThemes.navy;
  });

  useEffect(() => {
    // Apply CSS variables to root
    const root = document.documentElement;
    root.style.setProperty('--color-primary', theme.primary);
    root.style.setProperty('--color-primary-dark', theme.primaryDark);
    root.style.setProperty('--color-primary-light', theme.primaryLight);
    root.style.setProperty('--color-accent', theme.accent);

    // The installed app's title bar (and the browser's address bar on phones) takes the page's theme-color,
    // so it follows the chosen theme instead of staying blue.
    // 30% deeper than the sidebar's top colour, so the title bar and the sidebar read as two different bars where they meet.
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', darken(theme.primaryDark || theme.primary, 0.32));
    
    // Save to localStorage
    localStorage.setItem('biztrack-theme', JSON.stringify(theme));
  }, [theme]);

  const updateTheme = (newTheme) => {
    setTheme(newTheme);
  };

  const setPresetTheme = (presetKey) => {
    if (presetThemes[presetKey]) {
      setTheme(presetThemes[presetKey]);
    }
  };

  const setCustomTheme = (name, colors) => {
    setTheme({
      name,
      ...colors,
    });
  };

  const value = {
    theme,
    updateTheme,
    setPresetTheme,
    setCustomTheme,
    presetThemes,
  };

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
