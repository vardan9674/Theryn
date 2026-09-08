import React from "react";
import { initialsOf } from "../lib/format.js";
import { useBackHandler } from "../../lib/backStack.ts";

// ── Icons: stroke-based, 24px grid, currentColor ─────────────────────────
const svgProps = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" };
export const Icon = {
  Clients: (p) => <svg width={p.size || 22} height={p.size || 22} {...svgProps}><circle cx="9" cy="8" r="4" /><path d="M2 21c0-4 3-7 7-7s7 3 7 7" /><circle cx="17" cy="9" r="3" /><path d="M22 20c0-3-2-5-5-5" /></svg>,
  Plans: (p) => <svg width={p.size || 22} height={p.size || 22} {...svgProps}><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 8h8M8 12h8M8 16h5" /></svg>,
  Payments: (p) => <svg width={p.size || 22} height={p.size || 22} {...svgProps}><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" /></svg>,
  Messages: (p) => <svg width={p.size || 22} height={p.size || 22} {...svgProps}><path d="M21 12a8 8 0 0 1-11.6 7.1L4 21l1.9-4.6A8 8 0 1 1 21 12z" /></svg>,
  Search: (p) => <svg width={p.size || 16} height={p.size || 16} {...svgProps}><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>,
  Plus: (p) => <svg width={p.size || 16} height={p.size || 16} {...svgProps} strokeWidth={2.5}><path d="M12 5v14M5 12h14" /></svg>,
  Chevron: (p) => <svg width={p.size || 18} height={p.size || 18} {...svgProps}><path d="M9 6l6 6-6 6" /></svg>,
  Back: (p) => <svg width={p.size || 20} height={p.size || 20} {...svgProps}><path d="M15 6l-6 6 6 6" /></svg>,
  Close: (p) => <svg width={p.size || 16} height={p.size || 16} {...svgProps}><path d="M6 6l12 12M18 6L6 18" /></svg>,
  Sheet: (p) => <svg width={p.size || 16} height={p.size || 16} {...svgProps}><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M3 15h18M9 3v18" /></svg>,
  Edit: (p) => <svg width={p.size || 16} height={p.size || 16} {...svgProps}><path d="M4 20h4l10-10-4-4L4 16v4z" /></svg>,
  Download: (p) => <svg width={p.size || 16} height={p.size || 16} {...svgProps} strokeWidth={2.5}><path d="M12 4v12M6 10l6 6 6-6M4 20h16" /></svg>,
  Send: (p) => <svg width={p.size || 18} height={p.size || 18} {...svgProps}><path d="M22 2L11 13" /><path d="M22 2l-7 20-4-9-9-4 20-7z" /></svg>,
  Grip: (p) => <svg width={p.size || 18} height={p.size || 18} {...svgProps}><path d="M8 6h.01M8 12h.01M8 18h.01M16 6h.01M16 12h.01M16 18h.01" /></svg>,
  Trash: (p) => <svg width={p.size || 16} height={p.size || 16} {...svgProps}><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></svg>,
  Check: (p) => <svg width={p.size || 12} height={p.size || 12} {...svgProps} strokeWidth={3}><path d="M5 12l5 5 9-10" /></svg>,
  Down: (p) => <svg width={p.size || 12} height={p.size || 12} {...svgProps} strokeWidth={2.5}><path d="M6 9l6 6 6-6" /></svg>,
  Share: (p) => <svg width={p.size || 16} height={p.size || 16} {...svgProps}><path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M16 6l-4-4-4 4M12 2v13" /></svg>,
  Copy: (p) => <svg width={p.size || 16} height={p.size || 16} {...svgProps}><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a1 1 0 0 1 1-1h10" /></svg>,
  User: (p) => <svg width={p.size || 18} height={p.size || 18} {...svgProps}><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 4-7 8-7s8 3 8 7" /></svg>,
};

// ── Buttons ──────────────────────────────────────────────────────────────
export function Button({ variant = "default", size, block, icon, children, className = "", ...rest }) {
  const cls = ["cx-btn", variant === "primary" && "cx-btn-primary", variant === "soft" && "cx-btn-soft", variant === "danger" && "cx-btn-danger", size === "sm" && "cx-btn-sm", block && "cx-btn-block", icon && (children == null || children === false) && "cx-btn-icon", className].filter(Boolean).join(" ");
  return <button type="button" className={cls} {...rest}>{icon}{children}</button>;
}

export function Avatar({ name, size }) {
  const cls = ["cx-avatar", size === "lg" && "cx-avatar-lg", size === "sm" && "cx-avatar-sm"].filter(Boolean).join(" ");
  return <div className={cls} aria-hidden="true">{initialsOf(name)}</div>;
}

const TONE_COLORS = { ok: "var(--cx-tx2)", warn: "var(--cx-amber)", bad: "var(--cx-red)", attention: "var(--cx-orange)", muted: "var(--cx-mu)" };
export function Tone({ tone = "ok", bold, children, style }) {
  return <span style={{ color: TONE_COLORS[tone] || TONE_COLORS.ok, fontWeight: bold || tone !== "ok" ? 600 : 400, ...style }}>{children}</span>;
}

export function Chip({ active, children, ...rest }) {
  return <button type="button" className="cx-chip" aria-pressed={active ? "true" : "false"} {...rest}>{children}</button>;
}

export function Pill({ color, bg, children }) {
  return <span className="cx-pill" style={{ color, background: bg || `${color}1A` }}>{children}</span>;
}

export function Spinner({ label }) {
  return (
    <div style={{ padding: "32px 0", textAlign: "center", color: "var(--cx-mu)", fontSize: 13 }}>
      <div className="cx-spinner" style={{ marginBottom: label ? 10 : 0 }} />
      {label}
    </div>
  );
}

export function Empty({ title, children, action }) {
  return (
    <div className="cx-empty">
      {title && <b>{title}</b>}
      <div>{children}</div>
      {action && <div style={{ marginTop: 16 }}>{action}</div>}
    </div>
  );
}

// ── Sheet / modal: bottom sheet on phone, centered dialog on wider screens ──
export function Sheet({ open, onClose, title, subtitle, children, wide }) {
  useBackHandler(Boolean(open), () => onClose?.());
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="cx-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }} role="presentation">
      <div className="cx-sheet" role="dialog" aria-modal="true" aria-label={title} style={wide ? { maxWidth: 760 } : undefined}>
        <div className="cx-sheet-grip" />
        {title && <h2>{title}</h2>}
        {subtitle && <div className="cx-sub">{subtitle}</div>}
        {children}
      </div>
    </div>
  );
}

// ── Toast ─────────────────────────────────────────────────────────────────
const ToastCtx = React.createContext(() => {});
export function ToastProvider({ children }) {
  const [toast, setToast] = React.useState(null);
  const timer = React.useRef(null);
  const show = React.useCallback((message, kind = "ok") => {
    setToast({ message, kind });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), 2800);
  }, []);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {toast && <div className={`cx-toast ${toast.kind === "error" ? "err" : ""}`} role="status">{toast.message}</div>}
    </ToastCtx.Provider>
  );
}
export function useToast() { return React.useContext(ToastCtx); }

// ── Forms ─────────────────────────────────────────────────────────────────
export function Field({ label, children }) {
  return <label className="cx-field"><span className="cx-label">{label}</span>{children}</label>;
}
export function Checkbox({ checked, onChange, children }) {
  return (
    <button type="button" className="cx-check" role="checkbox" aria-checked={checked} onClick={() => onChange(!checked)}>
      <i className={checked ? "on" : ""}>{checked && <Icon.Check />}</i>
      <span>{children}</span>
    </button>
  );
}

// ── Responsive helpers ────────────────────────────────────────────────────
export function useViewport() {
  const get = () => {
    const w = typeof window !== "undefined" ? window.innerWidth : 1200;
    return w < 768 ? "phone" : w < 1100 ? "tablet" : "laptop";
  };
  const [vp, setVp] = React.useState(get);
  React.useEffect(() => {
    let t = 0;
    const onResize = () => { clearTimeout(t); t = setTimeout(() => setVp(get()), 80); };
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    return () => { window.removeEventListener("resize", onResize); window.removeEventListener("orientationchange", onResize); clearTimeout(t); };
  }, []);
  return vp;
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="cx-tabs" role="tablist">
      {tabs.map((t) => (
        <button key={t.id} type="button" role="tab" className="cx-tabbtn" aria-selected={value === t.id} onClick={() => onChange(t.id)}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function Confirm({ open, title, body, confirmLabel = "Confirm", danger, onConfirm, onClose, busy }) {
  return (
    <Sheet open={open} onClose={onClose} title={title} subtitle={body}>
      <div className="cx-actions-2">
        <Button onClick={onClose}>Cancel</Button>
        <Button variant={danger ? "danger" : "primary"} onClick={onConfirm} disabled={busy}>{busy ? "Working…" : confirmLabel}</Button>
      </div>
    </Sheet>
  );
}
