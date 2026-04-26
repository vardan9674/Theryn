import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.theryn.app',
  appName: 'Theryn',
  webDir: 'dist',
  plugins: {
    CapacitorHttp: {
      enabled: true,
    },
    PushNotifications: {
      // iOS foreground display options. Android channels control display
      // characteristics on that platform.
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
};

export default config;
