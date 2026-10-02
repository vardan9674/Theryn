import React from "react";
import ReactDOM from "react-dom";
import PrivacyPolicy from "./PrivacyPolicy.jsx";
import Terms from "./Terms.jsx";
import LegalPage from "./LegalPage.jsx";
import DeleteAccount from "./DeleteAccount.jsx";

// In-app version of the legal pages, so they open inside the app and work
// offline. view: "privacy" | "terms" | "delete".
export default function LegalOverlay({ view, role = "athlete", onClose, onDeleted }) {
  React.useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  if (!view) return null;
  const body = view === "privacy" ? <PrivacyPolicy onClose={onClose} />
    : view === "terms" ? <Terms onClose={onClose} />
    : <LegalPage title="Delete account" onClose={onClose}><DeleteAccount role={role} onCancel={onClose} onDeleted={onDeleted} /></LegalPage>;
  return ReactDOM.createPortal(
    <div role="dialog" aria-modal="true" style={{ position: "fixed", inset: 0, zIndex: 400, overflowY: "auto", WebkitOverflowScrolling: "touch", background: "#080808" }}>
      {body}
    </div>,
    document.body,
  );
}
