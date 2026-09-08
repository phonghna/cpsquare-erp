import type { CapacitorConfig } from "@capacitor/cli";

// The Android app is a thin native shell around the real, live website —
// it does NOT bundle the Next.js server (that can't run inside a mobile
// WebView; it needs a Node.js server, which is why this app stays deployed
// on Vercel/your host as usual). `server.url` tells the WebView to load
// that live site directly, so every page, API route, and session-cookie
// login flow behaves exactly like the website, and any future update you
// deploy to https://techdz.de shows up in the app immediately too — no
// app-store update needed for ordinary content/feature changes.
const config: CapacitorConfig = {
  appId: "de.techdz.cpsquare",
  appName: "CPSquare ERP",
  webDir: "public",
  server: {
    url: "https://techdz.de",
    // The site is HTTPS, so Android's WebView doesn't need cleartext
    // (plain http) traffic allowed. Keep this false unless you switch the
    // deployed site to a plain-http address during testing.
    cleartext: false,
    androidScheme: "https",
  },
  android: {
    allowMixedContent: false,
  },
};

export default config;
