/**
 * Colour themes a user can pick in the top bar. The colours themselves live in styles.scss
 * (`html[data-theme='…']` blocks); this list only drives the picker and the browser bar colour.
 * Keep the ids in sync with THEME_IDS in the backend (modules/auth/dto/login.dto.ts).
 */
export type ThemeId = 'golden' | 'espresso' | 'berry' | 'forest';

export interface ThemeOption {
  id: ThemeId;
  name: string;
  /** Turns on PrimeNG's dark colour scheme (`.app-dark`). */
  dark: boolean;
  /** Colours of the small preview card in the picker. */
  preview: { sidebar: string; page: string; card: string; brand: string; accent: string };
}

export const DEFAULT_THEME: ThemeId = 'golden';

export const THEMES: readonly ThemeOption[] = [
  {
    id: 'golden',
    name: 'Golden Ivory',
    dark: false,
    preview: { sidebar: '#ffffff', page: '#f6f5f1', card: '#ffffff', brand: '#f5b700', accent: '#4f46e5' },
  },
  {
    id: 'espresso',
    name: 'Espresso Dark',
    dark: true,
    preview: { sidebar: '#15110e', page: '#1a1512', card: '#241d18', brand: '#f2b544', accent: '#c98a6b' },
  },
  {
    id: 'berry',
    name: 'Berry Rose',
    dark: false,
    preview: { sidebar: '#ffffff', page: '#faf5f3', card: '#ffffff', brand: '#a3173f', accent: '#e9a3b5' },
  },
  {
    id: 'forest',
    name: 'Forest Green',
    dark: false,
    preview: { sidebar: '#1b3d2f', page: '#f1f4f0', card: '#ffffff', brand: '#1f7a55', accent: '#e0a800' },
  },
];

export function isThemeId(value: unknown): value is ThemeId {
  return THEMES.some((t) => t.id === value);
}

export function themeOption(id: ThemeId): ThemeOption {
  return THEMES.find((t) => t.id === id) ?? THEMES[0];
}
