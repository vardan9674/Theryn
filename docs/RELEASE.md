# Releasing the Theryn apps (iOS, Android, web)

One codebase ships everywhere: the React app in `src/`, wrapped by Capacitor 8
for iOS (`ios/`) and Android (`android/`), and served as the website by Vercel.
Both native projects are in git so every setting is reviewable and reproducible.

| Platform | How it's built | Where it goes |
|---|---|---|
| Web (theryn.fit) | Vercel builds `main` | live on merge |
| Android phones and tablets | `npm run android:bundle` or the *Mobile release* workflow | Google Play (App Bundle) |
| iPhone and iPad | Xcode archive or the *Mobile release* workflow | App Store via TestFlight |
| Mac (Apple silicon) | the iPad build, "Designed for iPad" | App Store, opt-in in App Store Connect |
| Desktop / Chromebook | the website (installable PWA from `manifest.webmanifest`) | browser |

## Before the first store release

1. **Fill the legal facts** in `src/legal/legalConfig.js` (operator name and
   address, a privacy email someone reads, governing law and courts). Have a
   lawyer read `src/legal/PrivacyPolicy.jsx` and `src/legal/Terms.jsx`.
   `npm run release:check` fails until this is done.
2. **Deploy account deletion** (production change, approve first):
   `supabase functions deploy delete-account --project-ref rmzfisntgiodoadwaewx`.
   No database migration is needed: deleting the auth user cascades through
   every table (mapped in the PR that added this file).
3. **Sign in with Apple** (App Review guideline 4.8):
   - Apple Developer → Identifiers → `com.theryn.app` → enable *Sign in with Apple*.
   - Create a *Services ID* (e.g. `com.theryn.web`) for the web and Android
     flow, with return URL `https://rmzfisntgiodoadwaewx.supabase.co/auth/v1/callback`
     and domain `rmzfisntgiodoadwaewx.supabase.co`.
   - Create a Sign in with Apple *key* (.p8).
   - Supabase → Authentication → Providers → Apple: enable, set *Client IDs* to
     `com.theryn.app,com.theryn.web`, and paste the secret generated from the key.
     The secret expires every 6 months; put a calendar reminder in.
   - Supabase → Authentication → URL configuration: keep
     `com.theryn.app://login-callback` and add `https://www.theryn.fit/delete-account`.
4. **Android upload key**: create once and keep it out of git.
   ```
   keytool -genkeypair -v -keystore theryn-upload.jks -alias theryn -keyalg RSA -keysize 4096 -validity 10000
   ```
   Enroll in *Play App Signing* so Google holds the real signing key and a lost
   upload key can be reset. Locally, create `android/keystore.properties`
   (git-ignored) with `storeFile`, `storePassword`, `keyAlias`, `keyPassword`.
5. **GitHub secrets** for the *Mobile release* workflow: see the header of
   `.github/workflows/mobile-release.yml`. The App Store Connect API key needs
   the *App Manager* role.
6. **Accept the Xcode licence** on any Mac that builds iOS: `sudo xcodebuild -license accept`.

## Every release

1. Bump `version` in `package.json` and `MARKETING_VERSION` in
   `ios/App/App.xcodeproj/project.pbxproj` (same number; the check enforces it).
   Android reads `package.json` itself. Build numbers come from the CI run number.
2. `npm test && npm run release:check`.
3. Run *Actions → Mobile release* (or push a tag `v1.6.0`). Download the `.aab`
   and `.ipa` artifacts.
4. Android: Play Console → Internal testing → upload the `.aab` → promote.
   iOS: upload the `.ipa` with Apple's *Transporter* app → TestFlight → submit.
5. Answer the store forms from `docs/store/` (they only change when what the
   app collects changes).

Local builds work too: `npm run android:bundle` (needs Java 21; Android
Studio's bundled JDK works: `export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"`),
and `npm run ios` then Product → Archive in Xcode.

## Rules that keep the apps approvable

- **Account deletion stays in the app** (Profile → Delete account; coach: You →
  Delete account) and on the web at `/delete-account`. Apple 5.1.1(v), Google Play
  account-deletion policy.
- **Privacy policy is reachable** in the app (Profile, sign-in screen, coach You
  sheet) and at `/privacy`. Both store listings link to it.
- **No tracking, no ads, no analytics SDKs.** Adding any changes
  `ios/App/App/PrivacyInfo.xcprivacy`, `docs/store/` and the privacy policy, and
  may need App Tracking Transparency.
- **Every data type the app collects is declared** in the privacy manifest, the
  App Store privacy answers and Play's Data safety form. Change all four together.
- **No payments for digital content in the app.** Coach fees are bookkeeping of
  money paid outside Theryn. Selling anything digital in the apps must use Apple
  and Google in-app purchase.
- **Ask for notification permission in context**, never at launch.
- **Permissions stay minimal.** `release:check` fails on location, contacts,
  camera, storage, exact alarms or package queries.
- **Android targetSdk** must meet Google Play's yearly minimum (currently 35; we're on 36).
- **iOS privacy manifest** must list any new "required reason" API the app's own
  native code starts using.

## Known gaps

- **iOS push notifications don't arrive yet.** The app registers an APNs
  token, but `process-outbox` sends through Firebase Cloud Messaging, which needs
  an FCM registration token on iOS. Fix: add `@capacitor-firebase/messaging`,
  read the token with `FirebaseMessaging.getToken()` on iOS in
  `src/hooks/usePushNotifications.ts`, upload the APNs auth key to Firebase
  (Project settings → Cloud Messaging), then test on a real iPhone. Android is
  unaffected.
- **No in-app data export yet.** The privacy policy offers a copy by email;
  an in-app "Download my data" is the long-term answer.
