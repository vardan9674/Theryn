import React from "react";

// Shared layout for the privacy policy, terms and account-deletion pages.
// Rendered as a full web page (/privacy, /terms, /delete-account) and inside
// the native app as an overlay, so the text ships with the app and works offline.
// Plain inline styles on purpose: these pages load without the app's CSS.

const C = { bg: "#080808", s1: "#101010", bd: "#1E1E1E", tx: "#F0F0F0", sb: "#A8AEB7", a: "#C8FF00" };

export const legalStyles = {
  page: { background: C.bg, color: C.tx, minHeight: "100%", fontFamily: "-apple-system,'Helvetica Neue',Helvetica,sans-serif", WebkitFontSmoothing: "antialiased" },
  inner: { maxWidth: 720, margin: "0 auto", padding: "calc(env(safe-area-inset-top, 0px) + 24px) 20px calc(env(safe-area-inset-bottom, 0px) + 48px)" },
  h1: { fontSize: 30, fontWeight: 700, letterSpacing: "-0.03em", margin: "8px 0 6px" },
  meta: { fontSize: 13, color: C.sb, margin: "0 0 24px" },
  h2: { fontSize: 19, fontWeight: 700, letterSpacing: "-0.01em", margin: "28px 0 8px" },
  p: { fontSize: 15, lineHeight: 1.6, color: C.tx, margin: "0 0 12px" },
  li: { fontSize: 15, lineHeight: 1.6, margin: "0 0 6px" },
  ul: { paddingLeft: 20, margin: "0 0 12px" },
  card: { background: C.s1, border: `1px solid ${C.bd}`, borderRadius: 14, padding: "14px 16px", margin: "0 0 12px" },
  link: { color: C.a },
  back: { display: "inline-flex", alignItems: "center", gap: 6, minHeight: 44, background: "none", border: "none", color: C.tx, fontSize: 15, fontWeight: 600, padding: 0, cursor: "pointer" },
  colors: C,
};

export default function LegalPage({ title, updated, onClose, children }) {
  React.useEffect(() => {
    const prev = document.title;
    document.title = `${title} · Theryn`;
    return () => { document.title = prev; };
  }, [title]);
  return (
    <div style={legalStyles.page}>
      <main style={legalStyles.inner}>
        {onClose ? (
          <button type="button" onClick={onClose} style={legalStyles.back} aria-label="Close">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>
            Back
          </button>
        ) : (
          <a href="/" style={{ ...legalStyles.back, textDecoration: "none" }}>
            <img src="/theryn-logo.svg" alt="" width="24" height="24" style={{ borderRadius: 6 }} />Theryn
          </a>
        )}
        <h1 style={legalStyles.h1}>{title}</h1>
        {updated && <p style={legalStyles.meta}>{updated}</p>}
        {children}
      </main>
    </div>
  );
}

export function H2({ children, id }) { return <h2 id={id} style={legalStyles.h2}>{children}</h2>; }
export function P({ children }) { return <p style={legalStyles.p}>{children}</p>; }
export function UL({ items }) { return <ul style={legalStyles.ul}>{items.map((x, i) => <li key={i} style={legalStyles.li}>{x}</li>)}</ul>; }
export function A({ href, children }) { return <a href={href} style={legalStyles.link}>{children}</a>; }
