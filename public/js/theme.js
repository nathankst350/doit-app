// DOIT Theme Management Module
import { api } from './api.js';

const THEME_ATTR = 'data-theme';

export async function initTheme() {
  const toggleBtn = document.getElementById('theme-toggle-btn');
  if (!toggleBtn) return;

  // Set initial event listener
  toggleBtn.addEventListener('click', toggleTheme);

  try {
    // 1. Fetch setting from SQLite DB
    const settings = await api.getSettings();
    let theme = settings.theme;

    // 2. If no setting, check system preference
    if (!theme) {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      theme = prefersDark ? 'dark' : 'light';
      // Save it
      await api.saveSetting('theme', theme);
    }

    // 3. Apply theme to HTML
    setTheme(theme);
  } catch (err) {
    console.warn('Failed to load theme settings, falling back to system preference.', err);
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    setTheme(prefersDark ? 'dark' : 'light');
  }
}

export function getActiveTheme() {
  return document.documentElement.getAttribute(THEME_ATTR) || 'dark';
}

export async function toggleTheme() {
  const currentTheme = getActiveTheme();
  const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
  
  setTheme(newTheme);

  try {
    await api.saveSetting('theme', newTheme);
  } catch (err) {
    console.error('Failed to save theme setting:', err);
  }
}

function setTheme(theme) {
  document.documentElement.setAttribute(THEME_ATTR, theme);
}
