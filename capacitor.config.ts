import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.wbpos.app',
  appName: 'WB-POS',
  webDir: 'dist/frontend/browser',
  server: {
    androidScheme: 'https',
  },
};

export default config;
