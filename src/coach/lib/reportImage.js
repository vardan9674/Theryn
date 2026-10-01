// "Save as image": the shared report as one 1080×1350 picture a coach can post
// or send anywhere (Instagram's 4:5 fits WhatsApp too).
//
// Drawn on a canvas straight from the same body paths the app uses — Path2D
// reads SVG path data directly — so there is no image library to ship. It
// draws only the snapshot, the same client-facing copy the link shows, so the
// picture can never say more than the coach chose to share.
import { BODY_FRONT, BODY_BACK } from "../../lib/bodyMap/bodyPaths.js";
import { SLUG_TO_GROUP } from "../../lib/exerciseLibrary.js";
import { muscleWords } from "../../lib/muscleHeat.js";
import { weekLabel, volumeLine } from "./weeklyReport.js";
import { winWords } from "../../lib/workoutWins.js";

const W = 1080, H = 1350, PAD = 72;
const C = { bg: "#080808", tx: "#F0F0F0", tx2: "#B0B0B0", mu: "#8A8A8A", a: "#C8FF00", skin: "#2A2A2A", muscle: "#3D3D3D", stroke: "#101010" };
const LEVEL_FILL = { 3: "#C8FF00", 2: "#93BC00", 1: "#49590F" };
const DISPLAY = '"Big Shoulders Display", "Arial Narrow", sans-serif';
const MONO = '"JetBrains Mono", ui-monospace, Menlo, monospace';
const BODY = '-apple-system, "Helvetica Neue", Helvetica, sans-serif';
// The drawing's own coordinates (see VIEWBOX in bodyPaths.js).
const VB = { front: 48, back: 768, top: 90, w: 632, h: 1260 };

// The coach's dashboard doesn't load Theryn's display faces (only the landing
// page and the report view do), and a canvas can't wait on a stylesheet it
// never saw — so add it here, give it a moment, then ask for the faces.
const FONTS_HREF = "https://fonts.googleapis.com/css2?family=Big+Shoulders+Display:wght@800;900&family=JetBrains+Mono:wght@500;700&display=swap";
async function fontsReady() {
  try {
    if (!document.querySelector('link[href*="Big+Shoulders+Display"]')) {
      const l = document.createElement("link");
      l.rel = "stylesheet"; l.href = FONTS_HREF;
      const loaded = new Promise((r) => { l.onload = r; l.onerror = r; });
      document.head.appendChild(l);
      await Promise.race([loaded, new Promise((r) => setTimeout(r, 2000))]);
    }
    await Promise.race([
      Promise.all([document.fonts?.load(`900 100px ${DISPLAY}`), document.fonts?.load(`700 26px ${MONO}`)]),
      new Promise((r) => setTimeout(r, 2000)),
    ]);
  } catch { /* the fallbacks are fine */ }
}

function wrap(ctx, text, maxWidth) {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (ctx.measureText(next).width > maxWidth && line) { lines.push(line); line = w; } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

function drawBody(ctx, parts, originX, levels, x, y, height) {
  const s = height / VB.h;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.translate(-originX, -VB.top);
  ctx.lineWidth = 3;
  ctx.strokeStyle = C.stroke;
  for (const part of parts) {
    const g = SLUG_TO_GROUP[part.slug];
    ctx.fillStyle = !g ? C.skin : LEVEL_FILL[levels?.[g]] || C.muscle;
    for (const d of part.paths) { const p = new Path2D(d); ctx.fill(p); ctx.stroke(p); }
  }
  ctx.restore();
  return (VB.w * height) / VB.h; // drawn width
}

/** The picture, as a PNG Blob. */
export async function renderReportImage(snap) {
  await fontsReady();
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d");
  const s = snap || {};
  const maxW = W - PAD * 2;

  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);

  // Mark and who it's from
  ctx.strokeStyle = C.a; ctx.lineWidth = 12; ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(PAD + 6, PAD + 6); ctx.lineTo(PAD + 40, PAD + 40); ctx.moveTo(PAD + 40, PAD + 6); ctx.lineTo(PAD + 6, PAD + 40); ctx.stroke();
  ctx.fillStyle = C.tx2; ctx.font = `500 30px ${BODY}`; ctx.textBaseline = "middle";
  ctx.fillText(`From Coach ${s.coach || ""}`.trim(), PAD + 64, PAD + 24);

  let y = PAD + 110;
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = C.a; ctx.font = `700 26px ${MONO}`;
  ctx.fillText(`YOUR WEEK${s.period?.start ? " · " + weekLabel(s.period.start).toUpperCase() : ""}`, PAD, y);

  // Headline
  ctx.fillStyle = C.tx; ctx.font = `900 108px ${DISPLAY}`;
  y += 106;
  for (const line of wrap(ctx, String(s.headline || "Your week.").toUpperCase(), maxW).slice(0, 3)) { ctx.fillText(line, PAD, y); y += 98; }

  // Workouts, when the coach kept them in
  const w = s.workouts;
  y += 12;
  if (w) {
    ctx.font = `900 64px ${DISPLAY}`;
    const count = w.planned ? `${w.done || 0} OF ${w.planned}` : String(w.done || 0);
    ctx.fillText(count, PAD, y);
    const cw = ctx.measureText(count).width;
    ctx.fillStyle = C.tx2; ctx.font = `500 32px ${BODY}`;
    ctx.fillText("workouts done", PAD + cw + 18, y - 4);
  }

  // Body, front and back
  const bodyTop = y + 40, bodyH = Math.min(470, H - bodyTop - 230);
  if (s.muscles?.levels && bodyH > 200) {
    const bw = (VB.w * bodyH) / VB.h, gap = 40;
    const x0 = (W - (bw * 2 + gap)) / 2;
    drawBody(ctx, BODY_FRONT, VB.front, s.muscles.levels, x0, bodyTop, bodyH);
    drawBody(ctx, BODY_BACK, VB.back, s.muscles.levels, x0 + bw + gap, bodyTop, bodyH);
    y = bodyTop + bodyH + 64;
    if (s.muscles.top?.length) {
      ctx.fillStyle = C.tx; ctx.font = `700 42px ${BODY}`;
      ctx.fillText(`Mostly ${muscleWords(s.muscles.top)}.`, PAD, y);
      y += 60;
    }
  } else {
    y = bodyTop + 20;
  }

  // Wins: the top two fit; the rest are a count.
  if (s.wins?.items?.length) {
    const total = s.wins.items.length + (s.wins.more || 0);
    for (const x of s.wins.items.slice(0, 2)) {
      if (y > H - 190) break;
      ctx.fillStyle = C.a; ctx.font = `700 34px ${BODY}`;
      ctx.fillText(wrap(ctx, `↑ ${x.name}: ${winWords(x, s.wins.unit).line}`, maxW)[0], PAD, y);
      y += 50;
    }
    if (total > 2 && y < H - 190) {
      ctx.fillStyle = C.tx2; ctx.font = `500 30px ${BODY}`;
      ctx.fillText(`Better than last week on ${total} exercises.`, PAD, y);
      y += 50;
    }
  }
  if (s.volume?.total > 0 && y < H - 170) {
    ctx.fillStyle = C.tx2; ctx.font = `500 32px ${BODY}`;
    ctx.fillText(wrap(ctx, `Weight lifted: ${Math.round(s.volume.total).toLocaleString("en-US")} ${s.volume.unit}. ${volumeLine(s.volume)}`, maxW)[0], PAD, y);
    y += 52;
  }
  if (s.best) {
    ctx.fillStyle = C.a; ctx.font = `700 34px ${BODY}`;
    const n = (x) => (Number.isInteger(x) ? String(x) : String(Math.round(x * 10) / 10));
    const line = wrap(ctx, `New best: ${s.best.name} ${n(s.best.weight)} ${s.best.unit} × ${s.best.reps}`, maxW)[0];
    ctx.fillText(line, PAD, y);
    y += 52;
  }
  if (s.focus && y < H - 130) {
    ctx.fillStyle = C.tx2; ctx.font = `500 32px ${BODY}`;
    ctx.fillText(wrap(ctx, `Next week: ${s.focus}`, maxW)[0], PAD, y);
  }

  ctx.fillStyle = C.mu; ctx.font = `600 26px ${MONO}`;
  ctx.fillText("THERYN.FIT", PAD, H - PAD + 6);

  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not make the image."))), "image/png"));
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] || "");
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

/**
 * Makes the picture and hands it over: the phone's share sheet where there is
 * one (so it can go straight to WhatsApp or Instagram), a download otherwise.
 * Returns "shared" or "downloaded".
 */
export async function saveReportImage(snap, { filename = "theryn-week.png", isNative = false } = {}) {
  const blob = await renderReportImage(snap);
  if (isNative) {
    const [{ Filesystem, Directory }, { Share }] = await Promise.all([import("@capacitor/filesystem"), import("@capacitor/share")]);
    const res = await Filesystem.writeFile({ path: filename, data: await blobToBase64(blob), directory: Directory.Cache });
    try { await Share.share({ files: [res.uri] }); } catch { await Share.share({ url: res.uri }); }
    return "shared";
  }
  const file = typeof File === "function" ? new File([blob], filename, { type: "image/png" }) : null;
  if (file && navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file] });
    return "shared";
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return "downloaded";
}
