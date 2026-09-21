import React from "react";
import "./signin.css";
import { supabase } from "../../lib/supabase.ts";
import { setReturnTo, clearReturnTo, AUTH_CALLBACK_PATH } from "../../lib/authReturn.ts";
import { track } from "../../lib/events.ts";

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const RESEND_SECONDS = 60;

function friendly(error, step) {
  const msg = String(error?.message || error || "");
  if (/rate limit|too many|security purposes/i.test(msg)) return "Too many codes asked for. Wait a minute, then try again.";
  if (/expired|invalid|otp/i.test(msg) && step === "code") return "That code didn't work. Check it, or send a new one.";
  if (/signups not allowed|signup is disabled/i.test(msg)) return "New sign-ups by email are switched off right now. Use Google instead.";
  if (/fetch|network/i.test(msg)) return "Couldn't reach Theryn. Check your connection and try again.";
  return msg || "Something went wrong. Try again.";
}

/**
 * Sign in with Google, or with a code sent by email (roadmap 1.7). The code is
 * typed here, so it works inside WhatsApp's browser too; the email also has a
 * link, which lands back on `returnTo` through /oauth/consent.
 */
export function SignInPanel({ title, subtitle, returnTo = null, onSignedIn, compact = false }) {
  const [step, setStep] = React.useState("start"); // start | code
  const [email, setEmail] = React.useState("");
  const [code, setCode] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState(null);
  const [wait, setWait] = React.useState(0);
  const codeRef = React.useRef(null);

  React.useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);
  React.useEffect(() => { if (step === "code") codeRef.current?.focus(); }, [step]);

  const remember = () => { if (returnTo) setReturnTo(returnTo); else clearReturnTo(); };

  async function google() {
    setBusy(true); setError(null);
    remember();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}${AUTH_CALLBACK_PATH}`, queryParams: { prompt: "select_account" } },
    });
    if (error) { setBusy(false); setError(friendly(error)); }
  }

  async function sendCode(e) {
    e?.preventDefault();
    const addr = email.trim().toLowerCase();
    if (!EMAIL_RE.test(addr)) { setError("That email doesn't look right."); return; }
    setBusy(true); setError(null);
    remember();
    const { error } = await supabase.auth.signInWithOtp({
      email: addr,
      options: { shouldCreateUser: true, emailRedirectTo: `${window.location.origin}${AUTH_CALLBACK_PATH}` },
    });
    setBusy(false);
    if (error) { setError(friendly(error, "start")); return; }
    setEmail(addr); setCode(""); setStep("code"); setWait(RESEND_SECONDS);
  }

  async function verify(e) {
    e?.preventDefault();
    const token = code.replace(/\D/g, "");
    if (token.length < 6) { setError("Enter the code from the email."); return; }
    setBusy(true); setError(null);
    const { data, error } = await supabase.auth.verifyOtp({ email, token, type: "email" });
    setBusy(false);
    if (error || !data?.session) { setError(friendly(error || "invalid", "code")); return; }
    clearReturnTo();
    track("signin_email_code");
    onSignedIn?.(data.session);
  }

  return (
    <div className={`si-panel ${compact ? "compact" : ""}`}>
      {title && <h2 className="si-title">{step === "code" ? "Check your email" : title}</h2>}
      {step === "start" ? (
        <>
          {subtitle && <p className="si-sub">{subtitle}</p>}
          <button type="button" className="si-btn si-google" onClick={google} disabled={busy}>
            <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>
            Continue with Google
          </button>
          <div className="si-or"><span>or</span></div>
          <form onSubmit={sendCode} className="si-form">
            <label className="si-label" htmlFor="si-email">Email</label>
            <input id="si-email" className="si-input" type="email" inputMode="email" autoComplete="email" placeholder="you@example.com"
              value={email} onChange={(e) => { setEmail(e.target.value); setError(null); }} disabled={busy} />
            <button type="submit" className="si-btn si-primary" disabled={busy || !email.trim()}>{busy ? "Sending…" : "Email me a code"}</button>
          </form>
        </>
      ) : (
        <form onSubmit={verify} className="si-form">
          <p className="si-sub">We sent a code to <b>{email}</b>. Type it here, or tap the link in the email.</p>
          <label className="si-label" htmlFor="si-code">Code</label>
          <input id="si-code" ref={codeRef} className="si-input si-code" inputMode="numeric" autoComplete="one-time-code" maxLength={10} placeholder="123456"
            value={code} onChange={(e) => { setCode(e.target.value.replace(/\D/g, "").slice(0, 10)); setError(null); }} disabled={busy} />
          <button type="submit" className="si-btn si-primary" disabled={busy || code.length < 6}>{busy ? "Checking…" : "Sign in"}</button>
          <div className="si-row">
            <button type="button" className="si-link" onClick={() => { setStep("start"); setError(null); }}>Use a different email</button>
            <button type="button" className="si-link" onClick={sendCode} disabled={busy || wait > 0}>{wait > 0 ? `Send again in ${wait}s` : "Send a new code"}</button>
          </div>
          <p className="si-fine">Can't find it? Check spam. The code works for an hour.</p>
        </form>
      )}
      {error && <div className="si-error" role="alert">{error}</div>}
    </div>
  );
}

/** The same panel as a centred sheet over the page. */
export default function SignInSheet({ open, onClose, ...panel }) {
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="si-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div className="si-sheet" role="dialog" aria-modal="true" aria-label={panel.title || "Sign in"}>
        <button type="button" className="si-close" onClick={onClose} aria-label="Close">×</button>
        <SignInPanel {...panel} />
      </div>
    </div>
  );
}
