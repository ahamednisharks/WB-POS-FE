import { definePreset } from '@primeuix/themes';
import Aura from '@primeuix/themes/aura';

/** Aura preset re-tinted with the bakery brand colour #F5B700 (dark text on yellow). */
export const BakeryPreset = definePreset(Aura, {
  semantic: {
    primary: {
      50: '#fffbeb',
      100: '#fff4c2',
      200: '#ffe98a',
      300: '#ffdb4d',
      400: '#facc15',
      500: '#f5b700',
      600: '#d99a00',
      700: '#b37800',
      800: '#8c5c00',
      900: '#6b4600',
      950: '#3d2700',
    },
    colorScheme: {
      light: {
        primary: {
          color: '{primary.500}',
          contrastColor: '#2b2104',
          hoverColor: '{primary.600}',
          activeColor: '{primary.700}',
        },
        highlight: {
          background: '{primary.100}',
          focusBackground: '{primary.200}',
          color: '#3d2700',
          focusColor: '#3d2700',
        },
      },
    },
  },
});
