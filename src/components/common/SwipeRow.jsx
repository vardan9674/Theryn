import React, { useState } from "react";
import { motion, useAnimation, useMotionValue } from "framer-motion";
import { Haptics } from "@capacitor/haptics";

const RED = "#FF5C5C";
const DEFAULT_BG = "#080808";

/**
 * Swipe-left to reveal a Delete affordance, or fast-flick to delete instantly.
 * Shared between the App.jsx exercise rows and the template editor exercise
 * rows so the gesture stays consistent.
 *
 * Props:
 *   onDelete  — fn called when the user confirms delete
 *   bgColor   — background color of the row (so the swipe foreground matches)
 *   rowStyle  — extra wrapper styles
 *   children  — row contents
 */
export default function SwipeRow({ children, onDelete, rowStyle, bgColor }) {
  const [swiped, setSwiped] = useState(false);
  const controls = useAnimation();
  const x = useMotionValue(0);

  const handleDragEnd = async (e, info) => {
    const offset = info.offset.x;
    const velocity = info.velocity.x;

    if (offset < -160 || (offset < -80 && velocity < -600)) {
      Haptics.impact({ style: "medium" }).catch(() => {});
      await controls.start({ x: -window.innerWidth, transition: { duration: 0.18, ease: "easeIn" } });
      onDelete();
    } else if (offset < -60) {
      Haptics.impact({ style: "light" }).catch(() => {});
      setSwiped(true);
      controls.start({ x: -80, transition: { type: "spring", stiffness: 400, damping: 30 } });
    } else {
      setSwiped(false);
      controls.start({ x: 0, transition: { type: "spring", stiffness: 400, damping: 30 } });
    }
  };

  const handleDelete = () => {
    controls.start({ x: -window.innerWidth, transition: { duration: 0.18 } });
    setTimeout(onDelete, 180);
  };

  const bg = bgColor || DEFAULT_BG;

  return (
    <div style={{ position: "relative", overflow: "hidden", flex: 1, ...rowStyle }}>
      <div
        onClick={handleDelete}
        style={{
          position: "absolute", right: 0, top: 0, bottom: 0,
          width: "80px",
          display: "flex", justifyContent: "center", alignItems: "center",
          background: RED, cursor: "pointer",
        }}
      >
        <span style={{ color: "#fff", fontSize: "13px", fontWeight: "700" }}>Delete</span>
      </div>
      <motion.div
        drag="x"
        dragConstraints={{ left: -80, right: 0 }}
        dragElastic={{ left: 0.3, right: 0 }}
        style={{ x, position: "relative", zIndex: 1, background: bg, touchAction: "pan-y", width: "100%", height: "100%", display: "flex", flexDirection: "column" }}
        animate={controls}
        onDragEnd={handleDragEnd}
        onClick={swiped ? () => { setSwiped(false); controls.start({ x: 0, transition: { type: "spring", stiffness: 400, damping: 30 } }); } : undefined}
      >
        {children}
      </motion.div>
    </div>
  );
}
