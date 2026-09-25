import React from "react";
import { createPortal } from "react-dom";
import { initialsOf } from "../lib/format.js";
import { initialColors } from "../lib/initialColor.js";
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
  Info: (p) => <svg width={p.size || 16} height={p.size || 16} {...svgProps}><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></svg>,
  Edit: (p) => <svg width={p.size || 16} height={p.size || 16} {...svgProps}><path d="M4 20h4l10-10-4-4L4 16v4z" /></svg>,
  Download: (p) => <svg width={p.size || 16} height={p.size || 16} {...svgProps} strokeWidth={2.5}><path d="M12 4v12M6 10l6 6 6-6M4 20h16" /></svg>,
  Send: (p) => <svg width={p.size || 18} height={p.size || 18} {...svgProps}><path d="M22 2L11 13" /><path d="M22 2l-7 20-4-9-9-4 20-7z" /></svg>,
  Grip: (p) => <svg width={p.size || 18} height={p.size || 18} {...svgProps}><path d="M8 6h.01M8 12h.01M8 18h.01M16 6h.01M16 12h.01M16 18h.01" /></svg>,
  Trash: (p) => <svg width={p.size || 16} height={p.size || 16} {...svgProps}><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></svg>,
  Flame: (p) => <svg width={p.size || 14} height={p.size || 14} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2c1.5 4 6 5.5 6 11a6 6 0 0 1-12 0c0-2.2 1.2-3.6 1.2-3.6S8.4 12 9.6 12c0-3 1.2-6.4 2.4-10z" /></svg>,
  Check: (p) => <svg width={p.size || 12} height={p.size || 12} {...svgProps} strokeWidth={3}><path d="M5 12l5 5 9-10" /></svg>,
  Down: (p) => <svg width={p.size || 12} height={p.size || 12} {...svgProps} strokeWidth={2.5}><path d="M6 9l6 6 6-6" /></svg>,
  Share: (p) => <svg width={p.size || 16} height={p.size || 16} {...svgProps}><path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M16 6l-4-4-4 4M12 2v13" /></svg>,
  Copy: (p) => <svg width={p.size || 16} height={p.size || 16} {...svgProps}><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a1 1 0 0 1 1-1h10" /></svg>,
  Lock: (p) => <svg width={p.size || 16} height={p.size || 16} {...svgProps}><rect x="5" y="10" width="14" height="11" rx="3" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>,
  Clock: (p) => <svg width={p.size || 16} height={p.size || 16} {...svgProps}><circle cx="12" cy="13" r="8" /><path d="M12 9v4l2.5 2.5M9 2h6" /></svg>,
  Play: (p) => <svg width={p.size || 16} height={p.size || 16} {...svgProps}><path d="M7 4.5v15l12-7.5z" fill="currentColor" stroke="none" /></svg>,
  Pause: (p) => <svg width={p.size || 16} height={p.size || 16} {...svgProps}><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" fill="currentColor" stroke="none" /></svg>,
  Link: (p) => <svg width={p.size || 16} height={p.size || 16} {...svgProps}><path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1" /><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" /></svg>,
  Person: (p) => <svg width={p.size || 16} height={p.size || 16} {...svgProps}><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" /></svg>,
  User: (p) => <svg width={p.size || 18} height={p.size || 18} {...svgProps}><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 4-7 8-7s8 3 8 7" /></svg>,
  Help: (p) => <svg width={p.size || 16} height={p.size || 16} {...svgProps}><circle cx="12" cy="12" r="9" /><path d="M9.5 9.5a2.5 2.5 0 0 1 5 0c0 1.7-2.5 2-2.5 3.5" /><path d="M12 17h.01" /></svg>,
  Bell: (p) => <svg width={p.size || 20} height={p.size || 20} {...svgProps}><path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4l2-2z" /><path d="M10 20a2 2 0 0 0 4 0" /></svg>,
};

// ── Buttons ──────────────────────────────────────────────────────────────
export function Button({ variant = "default", size, block, icon, children, className = "", ...rest }) {
  const cls = ["cx-btn", variant === "primary" && "cx-btn-primary", variant === "soft" && "cx-btn-soft", variant === "danger" && "cx-btn-danger", size === "sm" && "cx-btn-sm", block && "cx-btn-block", icon && (children == null || children === false) && "cx-btn-icon", className].filter(Boolean).join(" ");
  return <button type="button" className={cls} {...rest}>{icon}{children}</button>;
}

export function Avatar({ name, size }) {
  const cls = ["cx-avatar", size === "lg" && "cx-avatar-lg", size === "sm" && "cx-avatar-sm"].filter(Boolean).join(" ");
  // Each letter keeps its own colour, so "RP" reads as R and P.
  const { letters, colors, background } = initialColors(initialsOf(name));
  return (
    <div className={cls} style={{ background }} aria-hidden="true">
      {letters.map((ch, i) => <span key={i} style={{ color: colors[i].text }}>{ch}</span>)}
    </div>
  );
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

/**
 * Anything that covers the app (sheets, dialogs, the plan editor) renders into
 * <body>. Inside the scrolling page, iPhone Safari paints the blurred tab bar
 * on top of it, which hid the Save and Add buttons at the bottom of a sheet.
 */
export function Overlay({ children }) {
  const [host] = React.useState(() => (typeof document === "undefined" ? null : document.body));
  if (!host) return children;
  return createPortal(children, host);
}

// ── Keyboard focus for dialogs (#104) ──────────────────────────────────────
// Open sheets, newest last. Only the top one answers Escape and Tab.
const openSheets = [];
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function useDialogFocus(ref, open, onClose) {
  const closeRef = React.useRef(onClose);
  closeRef.current = onClose;
  React.useEffect(() => {
    if (!open) return;
    const id = {};
    openSheets.push(id);
    const before = document.activeElement;
    const root = document.getElementById("root");
    if (root) root.inert = true; // the page behind can't be tabbed into or read out
    // Into the dialog: whatever asked for focus (autoFocus), else the dialog
    // itself, so a phone doesn't pop the keyboard open for no reason.
    const t = setTimeout(() => {
      const el = ref.current;
      if (el && !el.contains(document.activeElement)) (el.querySelector("[autofocus]") || el).focus();
    }, 0);
    const onKey = (e) => {
      if (openSheets[openSheets.length - 1] !== id) return;
      if (e.key === "Escape") { e.preventDefault(); closeRef.current?.(); return; }
      if (e.key !== "Tab" || !ref.current) return;
      const items = [...ref.current.querySelectorAll(FOCUSABLE)].filter((x) => x.offsetParent !== null || x === document.activeElement);
      if (items.length === 0) { e.preventDefault(); return; }
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      else if (!ref.current.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(t);
      window.removeEventListener("keydown", onKey);
      const i = openSheets.indexOf(id);
      if (i >= 0) openSheets.splice(i, 1);
      if (root && openSheets.length === 0) root.inert = false;
      // Back to the button that opened it.
      if (before && typeof before.focus === "function" && document.contains(before)) before.focus();
    };
  }, [open, ref]);
}

// ── Sheet / modal: bottom sheet on phone, centered dialog on wider screens ──
export function Sheet({ open, onClose, title, subtitle, children, wide }) {
  useBackHandler(Boolean(open), () => onClose?.());
  const ref = React.useRef(null);
  useDialogFocus(ref, open, onClose);
  if (!open) return null;
  return (
    <Overlay>
    <div className="cx-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }} role="presentation">
      <div ref={ref} tabIndex={-1} className="cx-sheet" role="dialog" aria-modal="true" aria-label={title} style={wide ? { maxWidth: 760, outline: "none" } : { outline: "none" }}>
        <div className="cx-sheet-grip" />
        <button type="button" className="cx-sheet-close" aria-label="Close" onClick={() => onClose?.()}><Icon.Close size={18} /></button>
        {title && <h2>{title}</h2>}
        {subtitle && <div className="cx-sub">{subtitle}</div>}
        {children}
      </div>
    </div>
    </Overlay>
  );
}

// ── Toast ─────────────────────────────────────────────────────────────────
const ToastCtx = React.createContext(() => {});
export function ToastProvider({ children }) {
  const [toast, setToast] = React.useState(null);
  const timer = React.useRef(null);
  const show = React.useCallback((message, kind = "ok") => {
    setToast({ message, kind, overSheet: openSheets.length > 0 });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), 2800);
  }, []);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {toast && <div className={`cx-toast ${toast.kind === "error" ? "err" : ""} ${toast.overSheet ? "over-sheet" : ""}`} role="status">{toast.message}</div>}
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
