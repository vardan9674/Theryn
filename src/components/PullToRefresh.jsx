import { useEffect, useRef, useState } from "react";

const ACCENT = "#C8FF00";
const THRESHOLD = 70;
const MAX = 110;

export default function PullToRefresh({ onRefresh, refreshing = false, children }) {
  const [pullY, setPullY] = useState(0);
  const startYRef = useRef(null);
  const trackingRef = useRef(false);
  const refreshingRef = useRef(refreshing);
  const onRefreshRef = useRef(onRefresh);

  useEffect(() => { refreshingRef.current = refreshing; }, [refreshing]);
  useEffect(() => { onRefreshRef.current = onRefresh; }, [onRefresh]);

  useEffect(() => {
    let lastPullY = 0;

    const onTouchStart = (e) => {
      const scrollTop = window.scrollY || document.documentElement.scrollTop || document.body.scrollTop;
      if (scrollTop <= 0 && !refreshingRef.current && e.touches.length === 1) {
        startYRef.current = e.touches[0].clientY;
      } else {
        startYRef.current = null;
      }
    };

    const onTouchMove = (e) => {
      if (startYRef.current == null) return;
      const dy = e.touches[0].clientY - startYRef.current;
      if (dy > 0) {
        const scrollTop = window.scrollY || document.documentElement.scrollTop || document.body.scrollTop;
        if (scrollTop > 0) {
          startYRef.current = null;
          trackingRef.current = false;
          setPullY(0);
          lastPullY = 0;
          return;
        }
        const eased = Math.min(MAX, dy * 0.5);
        lastPullY = eased;
        setPullY(eased);
        trackingRef.current = true;
        if (e.cancelable) e.preventDefault();
      }
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

    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    window.addEventListener("touchcancel", onTouchEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("touchcancel", onTouchEnd);
    };
  }, []);

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
      <div style={{
        transform: `translateY(${offset}px)`,
        transition: (pullY === 0 && !refreshing) ? "transform 0.25s ease" : "none",
        willChange: "transform",
      }}>
        {children}
      </div>
    </>
  );
}
