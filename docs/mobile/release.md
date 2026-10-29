# Телефон: релиз в стор

Как сегодня собирается и публикуется `apps/mobile` (ADR-0067, ADR-0142). Отдельно от
`release.yml`/`images.yml` десктопа/веба (docs/06 «Релиз с 3.0»): ручной процесс, свой runbook.
Статус фич и устройство — [shared-web-status.md](shared-web-status.md).

## Идентификаторы

- **iOS**: bundle `dev.calab.mobile`, Apple team `3KGZ3829US`, приложение App Store Connect
  `6820671861`.
- **Android**: package `dev.calab.mobile`, Play App Signing; upload-ключ хранит мобильный лид вне
  git (не в этом репозитории; пути и имя файла здесь не называем).

## Env для сборки

`apps/mobile/.env` (копия `.env.example`, не коммитится):

```
EXPO_PUBLIC_CALAB_URL=https://app.calab.io
EXPO_PUBLIC_CALAB_LINK_HOSTS=app.calab.io
CALAB_IOS_BUNDLE_ID=dev.calab.mobile
CALAB_ANDROID_APPLICATION_ID=dev.calab.mobile
CALAB_IOS_PUSH_ENVIRONMENT=production
CALAB_IOS_INCOMING_CALLS=1
CALAB_IOS_NATIVE_CALL_AUDIO=1
CALAB_APP_VERSION=X.Y.Z
CALAB_IOS_BUILD_NUMBER=<растёт на каждую загрузку>
CALAB_ANDROID_VERSION_CODE=<по умолчанию = CALAB_IOS_BUILD_NUMBER>
```

`CALAB_APP_VERSION` — три числа (`parseReleaseIdentity`, `src/config.js`); номер сборки/версии
кода сверить с действующей историей дистрибуции в App Store Connect / Play Console перед загрузкой
— повтор того же номера отклоняется магазином.

## iOS

```
npx expo prebuild --platform ios --clean
xcodebuild -workspace ios/Calab.xcworkspace -scheme Calab -configuration Release \
  -destination 'generic/platform=iOS' -archivePath <out>/Calab.xcarchive archive \
  -allowProvisioningUpdates DEVELOPMENT_TEAM=3KGZ3829US CODE_SIGN_STYLE=Automatic
xcodebuild -exportArchive -archivePath <out>/Calab.xcarchive -exportPath <out>/export \
  -exportOptionsPlist ExportOptions.plist
```

`ExportOptions.plist`: `method` — `app-store-connect`, `signingStyle` — `automatic`,
`uploadSymbols` — `true`. `destination export` — только собрать ipa для осмотра, `destination
upload` — тем же `xcodebuild -exportArchive` сразу отправить в App Store Connect.

Проверить в собранном ipa:

- `codesign -dvv Calab.app` — подписано Apple Distribution нужной команды;
- entitlements содержат `aps-environment` и `com.apple.developer.associated-domains`
  (ADR-0142 — без второго universal links не свяжутся на устройстве);
- `CFBundleVersion` совпадает с `CALAB_IOS_BUILD_NUMBER`.

Export-compliance (`ios.config.usesNonExemptEncryption: false`, `app.config.ts`) объявлено
заранее: приложение использует только HTTPS и WebRTC DTLS-SRTP (стандартное шифрование), поэтому
App Store Connect на каждой сборке больше не спрашивает про экспортный контроль.

## Android

```
npx expo prebuild --platform android
cd android && ./gradlew bundleRelease \
  -Pandroid.injected.signing.store.file=<upload-keystore> \
  -Pandroid.injected.signing.store.password=<...> \
  -Pandroid.injected.signing.key.alias=calab-upload \
  -Pandroid.injected.signing.key.password=<...>
keytool -printcert -jarfile app/build/outputs/bundle/release/app-release.aab
```

`versionCode` (`CALAB_ANDROID_VERSION_CODE`) обязан расти на каждую загрузку — Play отклоняет
повтор того же числа. Play App Signing переподписывает aab для раздачи своим ключом; `keytool`
здесь проверяет именно upload-подпись перед отправкой.

## Магазины

- **TestFlight**: загрузка через `xcodebuild -exportArchive … upload` или Transporter; раздать
  группе внутреннего/внешнего тестирования, экспортные ограничения уже отвечены конфигом выше.
- **Play**: канал «Внутреннее тестирование», release notes с тегами `<en-US>`/`<ru-RU>`;
  вопрос об экспортном шифровании в Play Console отвечать «только стандартное» (HTTPS/DTLS-SRTP).

## Проверка ссылок (ADR-0142)

После публикации `.well-known` (docs/06 «Universal links / App Links»):

```
curl -sI https://app.calab.io/.well-known/apple-app-site-association
curl -sI https://app.calab.io/.well-known/assetlinks.json
curl -sI https://app-site-association.cdn-apple.com/a/v1/app.calab.io
curl -sI "https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://app.calab.io&relation=delegate_permission/common.handle_all_urls"
```

Все — `200`, `Content-Type: application/json`. Без этого ссылка из Telegram/почты откроет
браузер, а не приложение.

## Уборка

```
rm -rf apps/mobile/ios apps/mobile/android   # по ~1 ГБ каждый, prebuild создаёт заново
```

## Известные ограничения

- **Android**: push ещё нет (FCM не настроен, только APNs для iOS); навигационная политика
  WebView полагается на JS-ответ (не fail-closed к нативной проверке origin, 250 мс таймаут
  пропускает загрузку); ссылка, открытая при уже запущенном приложении, перезагружает WebView
  (нет host-канала ADR-0069, в отличие от iOS — там тёплая ссылка открывается на месте).
- **iOS**: пространства с обязательным SSO не поддерживаются (нет native callback adapter для
  внешнего IdP в WebView); экранная трансляция/системный звук и PiP также не реализованы.

Подробности и статус по датам — [shared-web-status.md](shared-web-status.md).
