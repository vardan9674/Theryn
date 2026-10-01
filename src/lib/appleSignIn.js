import { Capacitor } from "@capacitor/core";
import { Browser } from "@capacitor/browser";
import { supabase } from "./supabase";

// Sign in with Apple.
//
// App Review guideline 4.8: an app that offers Google sign-in must also offer
// an equally private option, so the iOS app shows this button next to Google.
//
// iOS: the native Apple sheet (@capacitor-community/apple-sign-in), then
// supabase.auth.signInWithIdToken. Apple gets the SHA-256 of a one-time nonce
// and Supabase gets the nonce itself, so a stolen token can't be replayed.
// Android and web: Supabase's Apple OAuth flow in the browser, the same way
// Google works (deep link com.theryn.app://login-callback on Android).
//
// Setup (Apple Developer + Supabase dashboard) is in docs/RELEASE.md.

const NATIVE_REDIRECT = "com.theryn.app://login-callback";

export function appleSignInAvailable() {
  // Android needs the Services ID configured in Supabase; iOS and web always.
  return true;
}

function randomNonce(bytes = 32) {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function signInWithApple() {
  const platform = Capacitor.getPlatform();

  if (platform === "ios") {
    const { SignInWithApple } = await import("@capacitor-community/apple-sign-in");
    const rawNonce = randomNonce();
    const res = await SignInWithApple.authorize({
      clientId: "com.theryn.app",
      redirectURI: "https://www.theryn.fit/auth/apple",
      scopes: "email name",
      state: randomNonce(8),
      nonce: await sha256Hex(rawNonce),
    });
    const r = res?.response || {};
    if (!r.identityToken) throw new Error("Apple didn't return a sign-in. Please try again.");
    const { data, error } = await supabase.auth.signInWithIdToken({ provider: "apple", token: r.identityToken, nonce: rawNonce });
    if (error) throw error;
    // Apple shares the name only on the very first sign-in. Keep it, so the
    // app never has to ask for something the person already told Apple.
    const fullName = [r.givenName, r.familyName].filter(Boolean).join(" ").trim();
    const uid = data?.user?.id;
    if (fullName && uid) {
      try { await supabase.auth.updateUser({ data: { full_name: fullName } }); } catch { /* not critical */ }
      try { await supabase.from("profiles").update({ display_name: fullName }).eq("id", uid).is("display_name", null); } catch { /* not critical */ }
    }
    return data;
  }

  if (platform === "android") {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "apple",
      options: { redirectTo: NATIVE_REDIRECT, skipBrowserRedirect: true },
    });
    if (error) throw error;
    if (data?.url) await Browser.open({ url: data.url });
    return null; // completes through the app's appUrlOpen handler, like Google
  }

  const { error } = await supabase.auth.signInWithOAuth({
    provider: "apple",
    options: { redirectTo: `${window.location.origin}/oauth/consent` },
  });
  if (error) throw error;
  return null;
}

// A cancelled Apple sheet is not an error worth showing.
export function isAppleCancel(err) {
  const m = String(err?.message || err || "");
  return /1001|cancel/i.test(m);
}
