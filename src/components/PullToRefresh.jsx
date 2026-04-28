import { useEffect, useRef, useState } from "react";

const ACCENT = "#C8FF00";
const THRESHOLD = 70;
const MAX = 110;
const ACTIVATION_SLOP = 8;

export default function PullToRefresh({ onRefresh, refreshing = false, scrollContainerRef, children }) {
  const [pullY, setPullY] = useState(0);
  const startYRef = useRef(null);
  const startXRef = useRef(null);
  const trackingRef = useRef(false);
  const wrapperRef = useRef(null);
  const refreshingRef = useRef(refreshing);
  const onRefreshRef = useRef(onRefresh);

  useEffect(() => { refreshingRef.current = refreshing; }, [refreshing]);
  useEffect(() => { onRefreshRef.current = onRefresh; }, [onRefresh]);

  useEffect(() => {
    const getScroller = () => {
      if (scrollContainerRef?.current) return scrollContainerRef.current;
      // Fallback: walk up from wrapper to find the nearest scrollable ancestor
      let el = wrapperRef.current?.parentElement;
      while (el && el !== document.body) {
        const style = window.getComputedStyle(el);
        if (/(auto|scroll)/.test(style.overflowY) && el.scrollHeight > el.clientHeight) return el;
        el = el.parentElement;
      }
      return null;
    };

    let lastPullY = 0;

    const onTouchStart = (e) => {
      if (refreshingRef.current || e.touches.length !== 1) {
        startYRef.current = null;
        return;
      }
      const scroller = getScroller();
      // Only arm when the actual scroll container is at the top
      if (!scroller || scroller.scrollTop > 0) {
        startYRef.current = null;
        return;
      }
      startYRef.current = e.touches[0].clientY;
      startXRef.current = e.touches[0].clientX;
      trackingRef.current = false;
    };

    const onTouchMove = (e) => {
      if (startYRef.current == null) return;
      const dy = e.touches[0].clientY - startYRef.current;
      const dx = e.touches[0].clientX - startXRef.current;
      // Bail if user moved upward (they want to scroll content), or moved sideways
      if (dy <= 0 || Math.abs(dx) > Math.abs(dy)) {
        startYRef.current = null;
        trackingRef.current = false;
        if (lastPullY) { setPullY(0); lastPullY = 0; }
        return;
      }
      // Re-check scroller in case content scrolled
      const scroller = getScroller();
      if (!scroller || scroller.scrollTop > 0) {
        startYRef.current = null;
        trackingRef.current = false;
        if (lastPullY) { setPullY(0); lastPullY = 0; }
        return;
      }
      // Require a small downward slop before we hijack the gesture, so taps and
      // small jitters don't get preventDefault'd (which breaks click synthesis on iOS).
      if (!trackingRef.current && dy < ACTIVATION_SLOP) return;
      trackingRef.current = true;
      const eased = Math.min(MAX, dy * 0.5);
      lastPullY = eased;
      setPullY(eased);
      if (e.cancelable) e.preventDefault();
    };

    const onTouchEnd = () => {
      if (trackingRef.current && lastPullY >= THRESHOLD && !refreshingRef.current) {
        onRefreshRef.current?.();
      }
      setPullY(0);
      lastPullY = 0;
      startYRef.current = null;
      trackingRef.current = false;
    };

    // Attach to the scroll container if available; otherwise to window.
    const target = getScroller() || window;
    target.addEventListener("touchstart", onTouchStart, { passive: true });
    target.addEventListener("touchmove", onTouchMove, { passive: false });
    target.addEventListener("touchend", onTouchEnd, { passive: true });
    target.addEventListener("touchcancel", onTouchEnd, { passive: true });
    return () => {
      target.removeEventListener("touchstart", onTouchStart);
      target.removeEventListener("touchmove", onTouchMove);
      target.removeEventListener("touchend", onTouchEnd);
      target.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [scrollContainerRef]);

  const offset = refreshing ? 60 : pullY;
  const progress = Math.min(1, pullY / THRESHOLD);
  const showIndicator = refreshing || pullY > 4;

  return (
    <>
      <style>{`@keyframes ptrSpin { to { transform: rotate(360deg); } }`}</style>
      {showIndicator && (
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0,
          height: 60, display: "flex", alignItems: "center", justifyContent: "center",
          transform: `translateY(${offset - 60}px)`,
          transition: (pullY === 0 && !refreshing) ? "transform 0.25s ease" : "none",
          pointerEvents: "none", zIndex: 50,
        }}>
          {refreshing ? (
            <div style={{
              width: 24, height: 24, borderRadius: "50%",
              border: `2.5px solid ${ACCENT}`,
              borderTopColor: "transparent",
              animation: "ptrSpin 0.7s linear infinite",
            }}/>
          ) : (
            <div style={{
              width: 24, height: 24, borderRadius: "50%",
              border: `2.5px solid ${ACCENT}`,
              opacity: 0.3 + 0.7 * progress,
              clipPath: `polygon(50% 50%, 50% 0%, ${50 + 50 * Math.sin(progress * 2 * Math.PI)}% ${50 - 50 * Math.cos(progress * 2 * Math.PI)}%, 50% 50%)`,
            }}/>
          )}
        </div>
      )}
      <div ref={wrapperRef} style={{
        transform: `translateY(${offset}px)`,
        transition: (pullY === 0 && !refreshing) ? "transform 0.25s ease" : "none",
        willChange: "transform",
      }}>
        {children}
      </div>
    </>
  );
}
