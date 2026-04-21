const A   = "#C8FF00";
const BG  = "var(--bg)";
const S1  = "var(--bg-s1)";
const BD  = "var(--border)";
const TX  = "var(--text)";
const SB  = "var(--text-sub)";
const MT  = "var(--text-muted)";

const btnPrim = {
  background: A,
  border: "none",
  borderRadius: "8px",
  color: "#000",
  fontWeight: "700",
  fontSize: "14px",
  padding: "11px 16px",
  cursor: "pointer",
};

export default function LoginScreen({ onSignIn, loading, error }) {
  return (
    <div style={{
      background: BG,
      minHeight: "100vh",
      maxWidth: "390px",
      margin: "0 auto",
      fontFamily: "-apple-system,'Helvetica Neue',Helvetica,sans-serif",
      color: TX,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "0 24px",
    }}>
      {/* Logo / App Name */}
      <div style={{ marginBottom: "48px", textAlign: "center" }}>
        <div style={{
          width: "72px",
          height: "72px",
          borderRadius: "18px",
          background: S1,
          border: `1px solid ${BD}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          margin: "0 auto 20px",
        }}>
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke={A} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="3"/>
            <line x1="8" y1="8" x2="16" y2="8"/>
            <line x1="8" y1="12" x2="16" y2="12"/>
            <line x1="8" y1="16" x2="12" y2="16"/>
          </svg>
        </div>
        <div style={{
          fontSize: "30px",
          fontWeight: "700",
          letterSpacing: "-0.04em",
          marginBottom: "8px",
        }}>
          Theryn
        </div>
        <div style={{
          fontSize: "14px",
          color: SB,
          lineHeight: "1.5",
        }}>
          Personal gym & body tracking
        </div>
      </div>

      {/* Sign In Button */}
      <button
        onClick={onSignIn}
        disabled={loading}
        style={{
          ...btnPrim,
          width: "100%",
          padding: "14px",
          fontSize: "15px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "10px",
          opacity: loading ? 0.6 : 1,
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24">
          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
        </svg>
        {loading ? "Signing in..." : "Sign in with Google"}
      </button>

      {/* Error */}
      {error && (
        <div style={{
          marginTop: "16px",
          fontSize: "13px",
          color: "var(--red)",
          textAlign: "center",
          padding: "10px 14px",
          background: S1,
          border: `1px solid ${MT}`,
          borderRadius: "8px",
          width: "100%",
        }}>
          {error}
        </div>
      )}

      {/* Footer */}
      <div style={{
        position: "absolute",
        bottom: "32px",
        fontSize: "11px",
        color: MT,
        letterSpacing: "0.06em",
      }}>
        No passwords. Just Google.
      </div>
    </div>
  );
}
