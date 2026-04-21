import { createContext, useContext, useEffect, useState } from "react";
import { Capacitor, registerPlugin } from "@capacitor/core";

// Access the native StatusBar plugin through Capacitor's bridge.
// This works on iOS and Android as long as the native side has the plugin
// (it ships with every Capacitor project). We don't need @capacitor/status-bar
// on the JS side — registerPlugin creates a typed proxy for free.
const StatusBar = registerPlugin("StatusBar");

const ThemeContext = createContext(null);

// ── Apply the correct native status bar style ────────────────────────────────
// iOS/Android status bar icons need to flip with the theme:
//   dark mode  → light icons  ("LIGHT" style)
//   light mode → dark icons   ("DARK"  style)
// Android also lets us set the background colour of the bar itself.
async function applyNativeStatusBar(theme) {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const style = theme === "light" ? "DARK" : "LIGHT";
    await StatusBar.setStyle({ style });

    // Android only — tint the status-bar background to match the app chrome
    if (Capacitor.getPlatform() === "android") {
      await StatusBar.setBackgroundColor({
        color: theme === "light" ? "#F4F5F7" : "#080808",
      });
    }
  } catch {
    // Plugin not available in this build — fail silently
  }
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => {
    const stored = localStorage.getItem("theryn-theme");
    if (stored === "light" || stored === "dark") return stored;
    return window.matchMedia("(prefers-color-scheme: light)").matches
      ? "light"
      : "dark";
  });

  useEffect(() => {
    // 1. Drive CSS variables via data-theme on <html>
    document.documentElement.setAttribute(
      "data-theme",
      theme === "light" ? "light" : ""
    );

    // 2. Persist preference
    localStorage.setItem("theryn-theme", theme);

    // 3. PWA / browser chrome theme-color meta
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = theme === "light" ? "#F4F5F7" : "#080808";

    // 4. Native Capacitor status bar (iOS + Android)
    applyNativeStatusBar(theme);
  }, [theme]);

  const toggleTheme = () => setTheme(t => (t === "dark" ? "light" : "dark"));

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
