# 0004 — Keep Google sign-in; add Apple before iOS release; email signup later

- Date: 2026-09-08
- Status: accepted

## Context
Google OAuth is the only sign-in today, using PKCE on web and a `com.theryn.app://` deep link on native. Apple App Store guideline 4.8 requires Sign in with Apple in any iOS app that offers a third-party social login. Email/password signup is wanted later.

## Decision
Google stays as is. Sign in with Apple is added before the first App Store submission (Roadmap 1.6). Email/password signup is added afterwards using the existing auth server (Roadmap 1.7), which already supports it in both cloud and self-hosted deployments.

## Consequences
- No auth rewrite; both additions are provider configuration plus a button.
- The role picker and onboarding flow must work for accounts without Google metadata (no avatar, no name).
- The landing page CTA currently signs out any existing session before starting OAuth; fix alongside 1.5.
