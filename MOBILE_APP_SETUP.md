# CPSquare ERP — Android App (Capacitor)

This project now has a native Android app shell (in `android/`) built with
[Capacitor](https://capacitorjs.com). It's a thin native wrapper: the app's
WebView loads your live site (`https://techdz.de`) directly — it does **not**
bundle the Next.js server (that can't run inside a mobile app; it needs
Node.js, which is why the site stays deployed on your host as usual).

This means:
- Every login, page, and API call in the app behaves exactly like the
  website, because it *is* the website, just wrapped in an app shell with its
  own icon and no browser address bar.
- Any update you deploy to `https://techdz.de` shows up in the app
  immediately — no app-store update needed for ordinary content/feature
  changes. You'd only need to rebuild/resubmit the app for things like a new
  icon, app name, or a native permission change.

## What's already done

- `@capacitor/core`, `@capacitor/cli`, `@capacitor/android` added to
  `package.json`.
- `capacitor.config.ts` — app id `de.techdz.cpsquare`, app name "CPSquare
  ERP", pointed at `https://techdz.de`.
- `android/` — the full native Android Studio project, scaffolded and
  verified file-by-file against a clean reference build.
- Camera permission wired up (`AndroidManifest.xml` + a runtime permission
  request in `MainActivity.java`) so the site's IMEI/barcode scanner
  (camera-based) can actually get camera access once compiled into the app —
  plain browser camera access needs this extra step inside a WebView, unlike
  in a normal mobile browser tab.

## What you still need to do (needs a real Android SDK — not available here)

I don't have Android Studio / the Android SDK / Gradle in this sandbox, so I
could scaffold and verify every file, but **the actual APK/AAB build has to
run on your own machine.**

### 1. Install Android Studio
Download from https://developer.android.com/studio if you don't have it. It
installs the Android SDK, an emulator, and everything Gradle needs.

### 2. Open the project
```
cd cpsquare-app
npm install
npx cap open android
```
This opens `android/` in Android Studio. Let Gradle sync (first sync can take
a few minutes — it downloads build tools).

### 3. Run it on a device/emulator to test
In Android Studio, press ▶ Run. Confirm:
- The app opens and shows your real login page.
- Login works, dashboard loads.
- The IMEI camera scanner (Inventory page) prompts for camera permission and
  actually shows a live camera feed. If the permission prompt doesn't appear
  or the feed stays black, see **Troubleshooting** below.

### 4. Replace the default icon (recommended before publishing)
Right-click `android/app/src/main/res` in Android Studio → **New → Image
Asset**, pick your logo, let it generate all the icon sizes. The default
Capacitor icon is a placeholder.

### 5. Build a signed release APK/AAB (for Google Play)
In Android Studio: **Build → Generate Signed Bundle / APK**. You'll need to
create a signing keystore the first time (Android Studio walks you through
it) — **back that keystore file up somewhere safe**; every future update to
this app must be signed with the same key, or Google Play will reject it.
- Choose **Android App Bundle (.aab)** if publishing to Google Play (required
  format there now).
- Choose **APK** if you just want an installable file to share directly
  (sideload) without going through the Play Store.

### 6. (Optional) Publish to Google Play
Requires a one-time $25 Google Play Console developer account
(https://play.google.com/console). Upload the signed `.aab`, fill in the
store listing (screenshots, description, privacy policy URL), submit for
review.

## Updating the app later

Because the app just loads your live website, most changes (new features,
bug fixes, UI tweaks) need **no app update at all** — deploy to
`https://techdz.de` as usual and every installed copy of the app picks it up
next time it's opened.

You only need to rebuild and resubmit the Android app itself for:
- Changing the app icon, name, or splash screen.
- Adding a new native permission or Capacitor plugin.
- Bumping the version number for a Play Store re-submission.

To resync after changing `capacitor.config.ts` or anything under `android/`:
```
npm run cap:sync
npm run cap:open
```

## Known harmless leftover

`android/app/src/main/java/com/getcapacitor/myapp/MainActivity.java` is a
stray unused file from the initial scaffolding (a template default that
didn't get cleaned up automatically). It's in a different Java package than
the real `MainActivity` and is never referenced by the app, so it's
harmless — but feel free to delete that one file (and its now-empty parent
folders) next time you're in Android Studio, purely for tidiness.

## Troubleshooting: camera scanner doesn't work in the app

Android's WebView needs the camera runtime permission granted to the *app*
before it will grant `getUserMedia()` (the browser camera API) to any page —
this is already wired up in `MainActivity.java`, but if it's still not
working on a real device:
1. Check the app's permission in Android Settings → Apps → CPSquare ERP →
   Permissions → make sure Camera is allowed.
2. If it's still blank, this can sometimes need Capacitor's own
   `@capacitor/camera` plugin instead of relying on plain browser
   `getUserMedia` inside the WebView — that's a bigger change (would need to
   modify the scanner code on the website itself to detect it's running
   inside the app and switch to the native camera API), so flag it back to
   me if the plain approach doesn't work reliably and I'll help wire that up.

## iOS

This setup only covers Android. Building for iOS requires a Mac with Xcode
(Apple doesn't allow iOS builds anywhere else), which isn't available in
this sandbox either. If you want an iOS app later, the config is already
90% shared (same `capacitor.config.ts`) — you'd mainly need to run
`npx cap add ios` on a Mac and go through Xcode's signing/App Store Connect
process, which I can walk you through step by step when you're ready.
