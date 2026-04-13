// capacitor.config.ts
import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId:   'dev.qoder.app',
  appName: 'Qoder',
  webDir:  'dist',
  server: {
    androidScheme: 'https',
    // allowNavigation: ['*.supabase.co']  // uncomment if needed
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      backgroundColor: '#0A0E1A',
      showSpinner: false,
      androidScaleType: 'CENTER_CROP',
      splashFullScreen: true,
      splashImmersive: true,
    },
    StatusBar: {
      style: 'Dark',
      backgroundColor: '#0A0E1A',
    },
    Keyboard: {
      resize: 'body',
      style: 'dark',
    },
  },
  android: {
    minSdkVersion: 24,          // Android 7.0+
    targetSdkVersion: 34,
    buildToolsVersion: '34.0.0',
    compileSdkVersion: 34,
    backgroundColor: '#0A0E1A',
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false, // set true for debug builds
  },
  ios: {
    contentInset: 'automatic',
    backgroundColor: '#0A0E1A',
    scrollEnabled: true,
    allowsLinkPreview: false,
  },
};

export default config;
