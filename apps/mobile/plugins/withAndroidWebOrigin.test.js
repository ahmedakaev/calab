const assert = require('node:assert/strict');
const path = require('node:path');
const process = require('node:process');
const { test } = require('node:test');
const withAndroidWebOrigin = require('./withAndroidWebOrigin');

const mobileRoot = path.dirname(require.resolve('../package.json'));

const manifest = () => ({
  manifest: { $: { 'xmlns:android': 'http://schemas.android.com/apk/res/android' }, application: [{ $: { 'android:name': '.MainApplication' }, 'meta-data': [] }] },
});

async function applyPlugin(t, url, modResults = manifest()) {
  const previous = process.env.EXPO_PUBLIC_CALAB_URL;
  t.after(() => {
    if (previous === undefined) delete process.env.EXPO_PUBLIC_CALAB_URL;
    else process.env.EXPO_PUBLIC_CALAB_URL = previous;
  });
  if (url === undefined) delete process.env.EXPO_PUBLIC_CALAB_URL;
  else process.env.EXPO_PUBLIC_CALAB_URL = url;
  const config = withAndroidWebOrigin({ name: 'Calab', slug: 'calab' });
  const result = await config.mods.android.manifest({
    ...config,
    modResults,
    modRequest: { projectRoot: mobileRoot, platformProjectRoot: mobileRoot, platform: 'android', modName: 'manifest' },
  });
  return result.modResults;
}

const originEntries = (modResults) => modResults.manifest.application[0]['meta-data']
  .filter((item) => item.$['android:name'] === withAndroidWebOrigin.META_DATA);

test('the manifest carries the canonical web origin once', async (t) => {
  const once = await applyPlugin(t, 'https://app.example.com/');
  assert.deepEqual(originEntries(once).map((item) => item.$['android:value']), ['https://app.example.com']);
  const twice = await applyPlugin(t, 'https://app.example.com:8443', once);
  assert.deepEqual(originEntries(twice).map((item) => item.$['android:value']), ['https://app.example.com:8443']);
});

test('no origin or a malformed one fails the Android prebuild', async (t) => {
  await assert.rejects(applyPlugin(t, undefined), /not set/);
  await assert.rejects(applyPlugin(t, 'http://app.example.com'), /https/);
  await assert.rejects(applyPlugin(t, 'https://app.example.com/path'), /bare origin/);
});
