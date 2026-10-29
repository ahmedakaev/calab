// The app origin for the native main-frame guard of the patched react-native-webview (ADR-0067,
// patches/react-native-webview@13.16.1.patch, CalabOriginGuard). It reaches native code only here:
// a manifest <meta-data> the patched RNCWebViewClient reads once. The value is the one App.tsx
// loads, `parseWebOrigin(EXPO_PUBLIC_CALAB_URL)`, read when the mod runs (after Expo loads `.env`).
// No origin fails the Android prebuild: without it the guard would refuse every navigation.
const { AndroidConfig, withAndroidManifest } = require('expo/config-plugins');
const process = require('node:process');
const { parseWebOrigin } = require('../src/config');

const META_DATA = 'dev.calab.mobile.WEB_ORIGIN';

module.exports = (config) => withAndroidManifest(config, (mod) => {
  const origin = parseWebOrigin(process.env.EXPO_PUBLIC_CALAB_URL);
  const application = AndroidConfig.Manifest.getMainApplicationOrThrow(mod.modResults);
  AndroidConfig.Manifest.addMetaDataItemToMainApplication(application, META_DATA, origin);
  return mod;
});

module.exports.META_DATA = META_DATA;
