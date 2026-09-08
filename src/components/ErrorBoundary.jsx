import React from "react";

/**
 * Last line of defence: instead of a white screen when something throws
 * during render, show a plain message and a reload button.
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("[ErrorBoundary]", error, info?.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    const msg = this.state.error?.message || String(this.state.error);
    return (
      <div style={{
        minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center",
        background: "#080808", color: "#F0F0F0", padding: 24,
        fontFamily: "-apple-system, 'Helvetica Neue', Helvetica, sans-serif",
      }}>
        <div style={{ maxWidth: 420, width: "100%", textAlign: "center" }}>
          <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>Something went wrong</div>
          <div style={{ fontSize: 14, color: "#8A8A8A", marginBottom: 20, lineHeight: 1.5 }}>
            The app hit an error it couldn't recover from. Reloading usually fixes it.
          </div>
          <button
            onClick={() => window.location.reload()}
            style={{ background: "#C8FF00", color: "#080808", border: "none", borderRadius: 10, padding: "12px 22px", fontSize: 15, fontWeight: 700, cursor: "pointer" }}
          >
            Reload
          </button>
          <details style={{ marginTop: 20, textAlign: "left", color: "#585858", fontSize: 12 }}>
            <summary style={{ cursor: "pointer" }}>Technical details</summary>
            <pre style={{ whiteSpace: "pre-wrap", marginTop: 8 }}>{msg}</pre>
          </details>
        </div>
      </div>
    );
  }
}
