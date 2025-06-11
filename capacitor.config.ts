import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.valchev.athletiq',
  appName: 'Athletiq',
  webDir: 'www',
  plugins: {
    App: {
      appUrlScheme: 'athletiq' // This defines your app's URL scheme
    }
  }
};

export default config;
