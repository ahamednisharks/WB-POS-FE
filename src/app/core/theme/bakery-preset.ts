import { definePreset } from '@primeuix/themes';
import Aura from '@primeuix/themes/aura';

/** Primary scale read from the active theme's CSS variables (--brand-50 … --brand-950 in styles.scss). */
const brandScale = Object.fromEntries(
  [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950].map((step) => [step, `var(--brand-${step})`]),
);

/**
 * Aura preset tinted with the app's theme colours. The colours are CSS variables, so switching
 * `data-theme` on <html> re-colours PrimeNG without re-running the preset. Espresso Dark also adds
 * `.app-dark`, which switches Aura to its dark scheme with warm brown surfaces.
 */
export const BakeryPreset = definePreset(Aura, {
  semantic: {
    primary: brandScale,
    colorScheme: {
      light: {
        primary: {
          color: '{primary.500}',
          contrastColor: 'var(--brand-ink)',
          hoverColor: '{primary.600}',
          activeColor: '{primary.700}',
        },
        highlight: {
          background: '{primary.100}',
          focusBackground: '{primary.200}',
          color: 'var(--brand-highlight-text)',
          focusColor: 'var(--brand-highlight-text)',
        },
      },
      dark: {
        surface: {
          0: '#ffffff',
          50: '#f7f3ee',
          100: '#ebe3d9',
          200: '#d6c9b9',
          300: '#b9a896',
          400: '#9a8876',
          500: '#7a6a5c',
          600: '#5c4f44',
          700: '#463b32',
          800: '#332a24',
          900: '#241d18',
          950: '#1a1512',
        },
        primary: {
          color: '{primary.500}',
          contrastColor: 'var(--brand-ink)',
          hoverColor: '{primary.400}',
          activeColor: '{primary.300}',
        },
        highlight: {
          background: 'color-mix(in srgb, {primary.400}, transparent 84%)',
          focusBackground: 'color-mix(in srgb, {primary.400}, transparent 76%)',
          color: 'rgba(255,255,255,.87)',
          focusColor: 'rgba(255,255,255,.87)',
        },
      },
    },
  },
});
