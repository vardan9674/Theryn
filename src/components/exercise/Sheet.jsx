import React, { useEffect, useState } from "react";
import { S1, BD, TX, MT } from "../templates/tokens.js";
import { useBackHandler } from "../../lib/backStack";

const MU = "#8A8A8A";

/**
 * Athlete-app sheet: slides up on phones, centred dialog on wide screens.
 * Closes on backdrop tap, the close button and the Android back button.
 * `onBack` (optional) runs instead of closing on the back button, for inner steps.
 * Children may be a function receiving close(), so a button can animate the sheet out.
 */
export default function Sheet({ title, subtitle, onClose, onBack, zIndex = 1050, children, footer, full = false }) {
  const [visible, setVisible] = useState(false);
  const isDesktop = typeof window !== "undefined" && window.innerWidth >= 768;
  useEffect(() => {
    const raf = requestAnimationFrame(() => setVisible(true));
    const t = setTimeout(() => setVisible(true), 60);
    return () => { cancelAnimationFrame(raf); clearTimeout(t); };
  }, []);
  const close = () => { setVisible(false); setTimeout(onClose, 200); };
  useBackHandler(true, () => (onBack ? onBack() : close()));

  return (
    <div onClick={close} style={{ position: "fixed", inset: 0, zIndex, display: "flex", alignItems: isDesktop ? "center" : "flex-end", justifyContent: "center",
      background: visible ? "rgba(0,0,0,0.72)" : "rgba(0,0,0,0)", transition: "background 0.2s ease" }}>
      <section role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}
        style={{ background: S1, width: isDesktop ? "520px" : "100%", height: full ? (isDesktop ? "86vh" : "92vh") : undefined, maxHeight: isDesktop ? "86vh" : "92vh",
          borderRadius: isDesktop ? "20px" : "22px 22px 0 0", border: `1px solid ${BD}`, boxSizing: "border-box", display: "flex", flexDirection: "column", overflow: "hidden",
          transform: visible ? "translateY(0)" : "translateY(100%)", opacity: visible ? 1 : 0, transition: "transform 0.22s cubic-bezier(0.32,0.72,0,1), opacity 0.2s ease" }}>
        <div style={{ padding: "12px 18px 10px", flexShrink: 0, display: "flex", flexDirection: "column", gap: "10px" }}>
          {!isDesktop && <div style={{ width: "40px", height: "5px", background: MT, borderRadius: "3px", margin: "0 auto" }} />}
          <div style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "4px" }}>
              <h2 style={{ margin: 0, fontSize: "21px", fontWeight: 700, letterSpacing: "-0.02em", color: TX }}>{title}</h2>
              {subtitle && <span style={{ fontSize: "14px", lineHeight: 1.4, color: MU }}>{subtitle}</span>}
            </div>
            <button type="button" onClick={close} aria-label="Close" style={{ width: "44px", height: "44px", marginRight: "-8px", background: "none", border: "none", color: MU, cursor: "pointer", fontSize: "22px" }}>×</button>
          </div>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "4px 18px 20px", display: "flex", flexDirection: "column", gap: "16px" }}>
          {typeof children === "function" ? children(close) : children}
        </div>
        {footer && (
          <div style={{ flexShrink: 0, padding: "12px 18px calc(16px + env(safe-area-inset-bottom, 0px))", borderTop: `1px solid ${BD}`, display: "flex", gap: "8px" }}>
            {typeof footer === "function" ? footer(close) : footer}
          </div>
        )}
      </section>
    </div>
  );
}

export const ui = {
  chip: (on) => ({ display: "inline-flex", alignItems: "center", minHeight: "36px", padding: "0 12px", borderRadius: "999px", fontSize: "13px", fontWeight: on ? 700 : 600,
    cursor: "pointer", fontFamily: "inherit", border: `1px solid ${on ? "#C8FF00" : "#1E1E1E"}`, background: on ? "#C8FF00" : "#181818", color: on ? "#000" : "#B0B0B0" }),
  label: { fontSize: "12px", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: MU },
  primary: (enabled = true) => ({ flex: 1, minHeight: "48px", borderRadius: "10px", border: enabled ? "none" : "1px solid #2C2C2C", background: enabled ? "#C8FF00" : "#181818",
    color: enabled ? "#000" : "#585858", fontSize: "15px", fontWeight: 700, cursor: enabled ? "pointer" : "default", fontFamily: "inherit" }),
  ghost: { minHeight: "48px", padding: "0 18px", borderRadius: "10px", border: "1px solid #2C2C2C", background: "none", color: "#F0F0F0", fontSize: "15px", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
};
