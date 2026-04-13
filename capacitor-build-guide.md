# Qoder — Capacitor Android/iOS Build Guide

## Prerequisites
- Node.js 18+
- Android Studio (for Android)
- Xcode 15+ (for iOS, macOS only)
- Java JDK 17+

---

## 1. Install Capacitor dependencies

```bash
npm install @capacitor/core @capacitor/cli
npm install @capacitor/android @capacitor/ios
npm install @capacitor/splash-screen @capacitor/status-bar @capacitor/keyboard
```

---

## 2. Add to your package.json scripts

```json
{
  "scripts": {
    "dev":           "vite",
    "build":         "vite build",
    "cap:init":      "npx cap init Qoder dev.qoder.app --web-dir dist",
    "cap:add:android": "npx cap add android",
    "cap:add:ios":   "npx cap add ios",
    "cap:sync":      "npm run build && npx cap sync",
    "cap:android":   "npm run cap:sync && npx cap open android",
    "cap:ios":       "npm run cap:sync && npx cap open ios",
    "cap:run:android": "npm run cap:sync && npx cap run android",
    "cap:run:ios":   "npm run cap:sync && npx cap run ios"
  }
}
```

---

## 3. Build steps

### Android APK / AAB

```bash
# 1. Build the React app + sync to Android
npm run cap:sync

# 2. Open in Android Studio (for signing & release builds)
npx cap open android

# 3. OR build debug APK directly from terminal:
cd android && ./gradlew assembleDebug
# Output: android/app/build/outputs/apk/debug/app-debug.apk

# 4. For release AAB (Play Store):
cd android && ./gradlew bundleRelease
```

### iOS IPA

```bash
# 1. Sync
npm run cap:sync

# 2. Open Xcode
npx cap open ios

# 3. Select your team, set bundle ID to dev.qoder.app
# 4. Product → Archive → Distribute
```

---

## 4. Android Signing (release builds)

Create `android/keystore.properties`:
```
storePassword=YOUR_STORE_PASSWORD
keyPassword=YOUR_KEY_PASSWORD
keyAlias=qoder
storeFile=../qoder-release.keystore
```

Generate keystore:
```bash
keytool -genkey -v -keystore android/qoder-release.keystore \
  -alias qoder -keyalg RSA -keysize 2048 -validity 10000
```

---

## 5. Live Reload (dev on device)

```bash
npx cap run android --livereload --external
```

---

## 6. Icons & Splash Screens

Place your source images in:
- `resources/icon.png`    — 1024×1024 PNG
- `resources/splash.png`  — 2732×2732 PNG

Then generate all sizes:
```bash
npm install @capacitor/assets --save-dev
npx capacitor-assets generate
```

---

## App permissions (android/app/src/main/AndroidManifest.xml)

Qoder only requires:
```xml
<uses-permission android:name="android.permission.INTERNET" />
```

No camera, storage, or location permissions needed.
