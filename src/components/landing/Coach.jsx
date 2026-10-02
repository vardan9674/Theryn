import React, { useEffect, useRef } from "react";

// The Theryn coach narrates the page: a small round clip with the lime ring in
// the corner of each section, and one short line. He tells one story top to
// bottom (Maya, her coach, the link), so each line picks up where the last
// left off. Clips are his own footage, cropped to the face (see
// ad-creative/mascot/MASCOT.md for who he is).

// One expression per beat of the story, so he reacts instead of repeating himself:
// wave (hello / goodbye), phone (checking it, worried), smile (warm, no hand),
// point, psst (leans in to whisper), count (grin), idea (finger up), fist (pump).
// Only "phone" is meant to look unhappy.
const CLIP_NAMES = ["wave", "phone", "smile", "point", "psst", "count", "idea", "fist"];
const CLIPS = Object.fromEntries(CLIP_NAMES.map(n => [n, [`/coach/coach-${n}.mp4`, `/coach/coach-${n}.jpg`]]));

export function CoachBubble({ line, clip = "smile" }) {
  const ref = useRef(null);
  const [src, poster] = CLIPS[clip] || CLIPS.smile;
  // Only the bubble on screen plays, so a phone never runs a dozen clips at once.
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) v.play?.().catch(() => {}); else v.pause?.();
    }, { threshold: 0.6 });
    io.observe(v);
    return () => io.disconnect();
  }, [src]);
  return (
    <div className="nf-coach">
      <video ref={ref} key={src} className="nf-coach-clip" src={src} poster={poster} muted loop playsInline preload="none" aria-hidden="true" />
      <p className="nf-coach-line" key={line}>{line}</p>
    </div>
  );
}
