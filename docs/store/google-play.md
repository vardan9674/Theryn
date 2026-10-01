# Google Play Console answers

Keep in step with `src/legal/PrivacyPolicy.jsx` and `docs/store/app-store.md`.

## Store settings

- **App name:** Theryn · **Package:** com.theryn.app
- **Category:** Health & Fitness · **Tags:** workout tracker, personal trainer
- **Privacy policy:** https://www.theryn.fit/privacy
- **Contains ads:** No
- **App access:** all features need sign-in. Give reviewers a test Google
  account (Play Console → App content → App access).
- **Target audience:** 18+ (Theryn's own minimum is 16; choosing 18+ keeps the
  app out of the Families programme).
- **Content rating (IARC):** Utility/Productivity-style answers: no violence,
  sexual content, gambling or controlled substances. Users can communicate
  (coach ↔ client messages) but cannot share location. Expected rating:
  Everyone / PEGI 3.
- **Health apps declaration:** Fitness, activity tracking. Not a medical device.
- **Financial features declaration:** None (coach fees are notes only; no
  payments, loans or banking).
- **Government apps:** No.

## Account deletion

- **Can users create an account?** Yes, with Google or Apple sign-in.
- **Delete account URL:** https://www.theryn.fit/delete-account
- **In-app path:** Profile → Delete account (coach: You → Delete account).
- **Data deleted:** everything in the account. **Data kept:** none, except
  backups that expire within 30 days.

## Data safety

**Does your app collect or share any of the required user data types?** Yes.
**Is all collected data encrypted in transit?** Yes.
**Do you provide a way to request data deletion?** Yes (in app and at the URL above).
**Shared with third parties:** No. (Supabase, Google Firebase and Vercel are
service providers processing on our behalf, which Play does not count as sharing.)

| Category → type | Collected | Optional? | Purpose |
|---|---|---|---|
| Personal info → Name | Yes | Required | App functionality, Account management |
| Personal info → Email address | Yes | Required | App functionality, Account management |
| Personal info → User IDs | Yes | Required | App functionality, Account management |
| Health and fitness → Health info (weight, height, measurements) | Yes | Optional | App functionality |
| Health and fitness → Fitness info (workouts, plans) | Yes | Required | App functionality |
| Messages → Other in-app messages | Yes | Optional | App functionality |
| Financial info → Other financial info (coach fee records) | Yes | Optional | App functionality |
| App info and performance | No | | |
| Device or other IDs (push token) | Yes | Optional | App functionality |

Processed ephemerally: No. Not collected: location, contacts, photos, files,
audio, calendar, web browsing, app activity analytics.

## Release

- Upload the `.aab` from the *Mobile release* workflow to **Internal testing**
  first, then Closed → Production.
- New personal developer accounts must run a closed test with at least 12
  testers for 14 days before Production access is granted.
- Target API: Play requires API 35 for updates; the app targets 36.
