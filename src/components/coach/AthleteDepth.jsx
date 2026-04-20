// ════════════════════════════════════════════════════════════════════════
// COACH DASHBOARD DEPTH COMPONENTS — "edge-lit" aesthetic
// ════════════════════════════════════════════════════════════════════════
// Thin strokes, soft glows, gradient area fills, interactive hover.
// Everything renders client-side from loadAthleteData() output.

import React from "react";

// Tokens mirrored from App.jsx
const A   = "#C8FF00";
const BG  = "#080808";
const S1  = "#101010";
const S2  = "#181818";
const BD  = "#1E1E1E";
const TX  = "#F0F0F0";
const SB  = "#585858";
const MT  = "#2C2C2C";

const TYPE_COLORS = {
  Push: "#FF8C42", Pull: "#4ECDC4", Legs: "#A8E6CF", Upper: "#C77DFF",
  Lower: "#FFD166", Rest: SB, Cardio: "#06D6A0", "Full Body": A,
  Core: "#FFD166", Run: "#06D6A0", Swim: "#4ECDC4", Bike: "#FFD166",
  HIIT: "#FF8C42", Yoga: "#C77DFF", Custom: SB,
};

// Shared card wrapper — soft inner glow, thin border
const cardStyle = {
  background: `linear-gradient(180deg, ${S2} 0%, ${S1} 100%)`,
  borderRadius: "16px",
  padding: "16px",
  border: `1px solid ${BD}`,
  marginBottom: "14px",
  position: "relative",
  overflow: "hidden",
};

const cardLabel = {
  fontSize: "10px", color: SB, letterSpacing: "0.1em",
  fontWeight: 600, textTransform: "uppercase",
};

function toIso(d) {
  return new Date(d).toISOString().split("T")[0];
}

// ────────────────────────────────────────────────────────────────────────
// 1. ATTENDANCE CALENDAR — week / month / 3-month views, date numerals,
//    completed workouts circled in accent green. Matches athlete dashboard.
// ────────────────────────────────────────────────────────────────────────
const DAY_LABELS = ["M", "T", "W", "T", "F", "S", "S"];

function startOfWeekMonday(d) {
  const out = new Date(d);
  const day = out.getDay();
  const diff = day === 0 ? 6 : day - 1;
  out.setDate(out.getDate() - diff);
  out.setHours(0, 0, 0, 0);
  return out;
}

function shiftDate(base, unit, amount) {
  const d = new Date(base);
  if (unit === "week") d.setDate(d.getDate() + 7 * amount);
  else if (unit === "month") d.setMonth(d.getMonth() + amount);
  else if (unit === "3month") d.setMonth(d.getMonth() + 3 * amount);
  return d;
}

export function AthleteAttendanceCalendar({ history, onDateTap }) {
  const [view, setView] = React.useState("month"); // 'week' | 'month' | '3month'
  const [anchor, setAnchor] = React.useState(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });

  const today = React.useMemo(() => {
    const d = new Date(); d.setHours(0, 0, 0, 0); return d;
  }, []);

  // Workout lookup: ISO-date → volume (0 means rest / no session)
  const volByDate = React.useMemo(() => {
    const map = {};
    (history || []).forEach(h => {
      map[h.date] = (map[h.date] || 0) + (h.totalVolume || 0);
    });
    return map;
  }, [history]);

  // Range & grid construction
  const { rangeLabel, monthsInRange, periodStart, periodEnd } = React.useMemo(() => {
    const fmtMonth = d => d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
    const fmtShort = d => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });

    if (view === "week") {
      const start = startOfWeekMonday(anchor);
      const end = new Date(start); end.setDate(start.getDate() + 6);
      const month = { label: fmtMonth(start), first: new Date(start.getFullYear(), start.getMonth(), 1) };
      return {
        rangeLabel: `${fmtShort(start)} – ${fmtShort(end)}`,
        monthsInRange: [ { ...month, days: buildMonthWeeks(start, end, start) } ],
        periodStart: start, periodEnd: end,
      };
    }
    if (view === "month") {
      const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
      const last = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
      return {
        rangeLabel: fmtMonth(first),
        monthsInRange: [{ label: fmtMonth(first), first, days: buildMonthWeeks(first, last, first) }],
        periodStart: first, periodEnd: last,
      };
    }
    // 3-month
    const startMonth = new Date(anchor.getFullYear(), anchor.getMonth() - 2, 1);
    const endMonth = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
    const months = [];
    for (let i = 0; i < 3; i++) {
      const first = new Date(startMonth.getFullYear(), startMonth.getMonth() + i, 1);
      const last = new Date(first.getFullYear(), first.getMonth() + 1, 0);
      months.push({ label: fmtMonth(first), first, days: buildMonthWeeks(first, last, first) });
    }
    return {
      rangeLabel: `${fmtShort(startMonth)} – ${fmtShort(endMonth)}`,
      monthsInRange: months,
      periodStart: startMonth, periodEnd: endMonth,
    };
  }, [view, anchor]);

  // Stats for the visible period
  const stats = React.useMemo(() => {
    let sessions = 0, totalVol = 0, maxStreak = 0, cur = 0;
    // Walk day by day from periodStart to periodEnd
    for (let d = new Date(periodStart); d <= periodEnd; d.setDate(d.getDate() + 1)) {
      const iso = toIso(d);
      const v = volByDate[iso] || 0;
      if (v > 0) {
        sessions++;
        totalVol += v;
        cur++;
        if (cur > maxStreak) maxStreak = cur;
      } else {
        cur = 0;
      }
    }
    return { sessions, totalVol, maxStreak };
  }, [periodStart, periodEnd, volByDate]);

  const nav = (dir) => setAnchor(prev => shiftDate(prev, view, dir));

  const DateCell = ({ date, dim, compact }) => {
    const iso = toIso(date);
    const worked = !!volByDate[iso];
    const isToday = iso === toIso(today);
    const future = date > today;
    const tappable = worked && onDateTap;

    const size = compact ? 26 : 32;
    const fontSize = compact ? "10px" : "12px";

    return (
      <button
        onClick={() => tappable && onDateTap(iso)}
        disabled={!tappable}
        aria-label={date.toDateString() + (worked ? " — workout logged" : "")}
        style={{
          appearance: "none",
          background: worked ? `${A}18` : "transparent",
          border: worked
            ? `2px solid ${A}`
            : isToday
              ? `1.5px solid ${MT}`
              : "1.5px solid transparent",
          width: size, height: size,
          borderRadius: "50%",
          display: "flex", alignItems: "center", justifyContent: "center",
          cursor: tappable ? "pointer" : "default",
          opacity: future ? 0.25 : dim ? 0.35 : 1,
          boxShadow: worked ? `0 0 8px ${A}40` : "none",
          padding: 0,
          transition: "transform 0.15s ease, box-shadow 0.2s ease",
          color: "inherit",
        }}
        className={tappable ? "press-scale" : ""}
      >
        <span style={{
          fontSize,
          fontWeight: isToday ? 800 : worked ? 700 : 500,
          color: worked ? A : isToday ? TX : SB,
          letterSpacing: "-0.01em",
        }}>
          {date.getDate()}
        </span>
      </button>
    );
  };

  const compactCells = view === "3month";

  return (
    <div style={{ ...cardStyle, padding: "14px" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px", gap: "8px" }}>
        <div style={{ minWidth: 0 }}>
          <div style={cardLabel}>Attendance</div>
          <div style={{ fontSize: "13px", color: TX, fontWeight: 700, marginTop: "2px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {rangeLabel}
          </div>
        </div>

        {/* View switcher */}
        <div style={{
          display: "flex", background: S1, borderRadius: "8px",
          border: `1px solid ${BD}`, overflow: "hidden", flexShrink: 0,
        }}>
          {[
            { k: "week", label: "W" },
            { k: "month", label: "M" },
            { k: "3month", label: "3M" },
          ].map(v => (
            <button
              key={v.k}
              onClick={() => setView(v.k)}
              style={{
                background: view === v.k ? MT : "transparent",
                border: "none",
                color: view === v.k ? TX : SB,
                padding: "5px 10px",
                fontSize: "11px",
                fontWeight: 700,
                letterSpacing: "0.04em",
                cursor: "pointer",
              }}
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>

      {/* Nav row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
        <button
          onClick={() => nav(-1)}
          aria-label="Previous"
          style={{
            background: S1, border: `1px solid ${BD}`, borderRadius: "8px",
            width: "28px", height: "28px",
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer", color: TX,
          }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
        </button>

        {/* Period KPIs */}
        <div style={{ display: "flex", gap: "16px", alignItems: "baseline" }}>
          <Stat label="Sessions" value={stats.sessions}/>
          <Stat label="Best Streak" value={stats.maxStreak + "d"}/>
          <Stat label="Volume" value={stats.totalVol >= 1000 ? (stats.totalVol / 1000).toFixed(1) + "k" : stats.totalVol || "—"}/>
        </div>

        <button
          onClick={() => nav(1)}
          aria-label="Next"
          disabled={periodEnd >= today && view !== "week"}
          style={{
            background: S1, border: `1px solid ${BD}`, borderRadius: "8px",
            width: "28px", height: "28px",
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer", color: TX,
            opacity: (periodEnd >= today && view !== "week") ? 0.35 : 1,
          }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6"/>
          </svg>
        </button>
      </div>

      {/* Day header labels */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", marginBottom: "6px" }}>
        {DAY_LABELS.map((l, i) => (
          <div key={i} style={{
            textAlign: "center", fontSize: "9px", color: SB,
            fontWeight: 700, letterSpacing: "0.08em",
          }}>{l}</div>
        ))}
      </div>

      {/* Month grid(s) */}
      {monthsInRange.map((m, mi) => (
        <div key={mi} style={{ marginBottom: mi < monthsInRange.length - 1 ? "14px" : 0 }}>
          {view === "3month" && (
            <div style={{ fontSize: "10px", color: SB, letterSpacing: "0.06em", textTransform: "uppercase", margin: "6px 0 4px", fontWeight: 600 }}>
              {m.label}
            </div>
          )}
          {m.days.map((week, wi) => (
            <div key={wi} style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "4px", marginBottom: "4px" }}>
              {week.map((d, di) => (
                <div key={di} style={{ display: "flex", justifyContent: "center" }}>
                  {d ? (
                    <DateCell
                      date={d}
                      dim={view !== "week" && d.getMonth() !== m.first.getMonth()}
                      compact={compactCells}
                    />
                  ) : (
                    <div style={{ width: compactCells ? 26 : 32, height: compactCells ? 26 : 32 }}/>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      ))}

      {/* Legend */}
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: "16px", marginTop: "10px", fontSize: "10px", color: SB }}>
        <LegendDot color={A} label="Workout"/>
        <LegendDot ring={MT} label="Today"/>
      </div>
    </div>
  );
}

// Helper: render one month as an array of weeks (arrays of 7 Date|null)
function buildMonthWeeks(rangeStart, rangeEnd, refDate) {
  // If the range is a single week, return exactly that week
  const startMs = rangeStart.getTime();
  const endMs = rangeEnd.getTime();
  const diffDays = Math.round((endMs - startMs) / (24 * 60 * 60 * 1000));
  if (diffDays === 6 && rangeStart.getDay() !== 1) {
    // Single-week anchored mode
    const week = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(rangeStart);
      d.setDate(rangeStart.getDate() + i);
      week.push(d);
    }
    return [week];
  }

  // Month grid — start at the Monday preceding the 1st of the month
  const first = new Date(refDate.getFullYear(), refDate.getMonth(), 1);
  const last  = new Date(refDate.getFullYear(), refDate.getMonth() + 1, 0);
  const startOffset = first.getDay() === 0 ? 6 : first.getDay() - 1;
  const gridStart = new Date(first);
  gridStart.setDate(first.getDate() - startOffset);

  const weeks = [];
  let cur = new Date(gridStart);
  while (cur <= last || weeks.length === 0) {
    const week = [];
    for (let i = 0; i < 7; i++) {
      week.push(new Date(cur));
      cur.setDate(cur.getDate() + 1);
    }
    weeks.push(week);
    if (cur > last) break;
  }
  return weeks;
}

function Stat({ label, value }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: "14px", fontWeight: 800, color: TX, letterSpacing: "-0.01em", lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: "8px", color: SB, letterSpacing: "0.1em", fontWeight: 600, marginTop: "3px", textTransform: "uppercase" }}>{label}</div>
    </div>
  );
}

function LegendDot({ color, ring, label }) {
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
      <span style={{
        width: "10px", height: "10px", borderRadius: "50%",
        background: color ? `${color}22` : "transparent",
        border: `1.5px solid ${color || ring}`,
        boxShadow: color ? `0 0 5px ${color}55` : "none",
      }}/>
      <span>{label}</span>
    </div>
  );
}

// Backward-compat alias (Progress tab still imports the old name)
export function AthleteAttendanceHeatmap(props) {
  return <AthleteAttendanceCalendar {...props} onDateTap={props.onCellTap || props.onDateTap}/>;
}

// ────────────────────────────────────────────────────────────────────────
// 2. VOLUME TREND — per-type sparkline rows, edge-lit
// ────────────────────────────────────────────────────────────────────────
//
// One thin line per workout type with a gradient area fill, weekly total,
// and trend arrow. Much lighter than stacked bars and communicates velocity.
//
function Sparkline({ values, color, width = 120, height = 32, onPointHover }) {
  if (!values || values.length === 0) return null;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const stepX = values.length > 1 ? width / (values.length - 1) : 0;
  const pts = values.map((v, i) => {
    const x = i * stepX;
    const y = height - ((v - min) / range) * (height - 4) - 2;
    return [x, y];
  });
  const d = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  const area = `${d} L${width},${height} L0,${height} Z`;
  const gradId = `spark-${color.replace("#", "")}`;

  return (
    <svg width={width} height={height} style={{ display: "block", overflow: "visible" }}>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35"/>
          <stop offset="100%" stopColor={color} stopOpacity="0"/>
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradId})`}/>
      <path d={d} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round"/>
      {/* last-point dot as the "edge light" */}
      {pts.length > 0 && (
        <>
          <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="4" fill={color} opacity="0.2"/>
          <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="2" fill={color}/>
        </>
      )}
      {onPointHover && pts.map((p, i) => (
        <rect
          key={i}
          x={p[0] - stepX / 2} y={0} width={stepX || width} height={height}
          fill="transparent"
          style={{ cursor: "pointer" }}
          onMouseEnter={() => onPointHover(i)}
          onMouseLeave={() => onPointHover(null)}
        />
      ))}
    </svg>
  );
}

function fmtVol(v) {
  if (!v) return "0";
  if (v >= 1000) return (v / 1000).toFixed(v >= 10000 ? 0 : 1) + "k";
  return Math.round(v).toString();
}

export function AthleteVolumeChart({ history }) {
  const [hoverIdx, setHoverIdx] = React.useState(null);

  const { rows, weekLabels } = React.useMemo(() => {
    if (!history || history.length === 0) return { rows: [], weekLabels: [] };
    // Build last 8 weeks of per-type volume totals
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const weekStarts = [];
    for (let i = 7; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - d.getDay() + 1 - i * 7); // Monday of the week i back
      weekStarts.push(d);
    }

    const byType = {}; // type -> number[8]
    const labels = weekStarts.map(d => d.toLocaleDateString("en-US", { month: "short", day: "numeric" }));

    for (const h of history) {
      const d = new Date(h.date + "T12:00:00");
      for (let i = 0; i < weekStarts.length; i++) {
        const start = weekStarts[i];
        const end = i === weekStarts.length - 1
          ? new Date(today.getTime() + 24 * 60 * 60 * 1000)
          : weekStarts[i + 1];
        if (d >= start && d < end) {
          const t = h.type || "Custom";
          if (!byType[t]) byType[t] = new Array(weekStarts.length).fill(0);
          byType[t][i] += h.totalVolume || 0;
          break;
        }
      }
    }

    const rows = Object.entries(byType)
      .map(([type, series]) => {
        const total = series.reduce((a, b) => a + b, 0);
        const latest = series[series.length - 1];
        const prior = series[series.length - 2] || 0;
        const delta = latest - prior;
        return { type, series, total, latest, delta };
      })
      .filter(r => r.total > 0)
      .sort((a, b) => b.total - a.total);

    return { rows, weekLabels: labels };
  }, [history]);

  if (rows.length === 0) return null;

  // 8-week totals and summary insight
  const grandTotal = rows.reduce((a, r) => a + r.total, 0);
  const totalLatest = rows.reduce((a, r) => a + r.latest, 0);
  const totalPrior = rows.reduce((a, r) => a + (r.series[r.series.length - 2] || 0), 0);
  const trendPct = totalPrior > 0 ? Math.round(((totalLatest - totalPrior) / totalPrior) * 100) : 0;

  const hoverLabel = hoverIdx !== null ? weekLabels[hoverIdx] : (weekLabels[weekLabels.length - 1] || "");
  const isCurrentWeek = hoverIdx === null || hoverIdx === weekLabels.length - 1;

  return (
    <div style={cardStyle}>
      {/* ── Header: title + explainer + 8-week grand total ─────────────── */}
      <div style={{ marginBottom: "14px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "10px" }}>
          <div>
            <div style={cardLabel}>Volume by workout type</div>
            <div style={{ fontSize: "11px", color: SB, marginTop: "4px", lineHeight: 1.4 }}>
              Weekly total weight lifted, broken down by workout type. Last 8 weeks.
            </div>
          </div>
          <div style={{ textAlign: "right", flexShrink: 0 }}>
            <div style={{ fontSize: "18px", fontWeight: 800, color: TX, letterSpacing: "-0.01em", lineHeight: 1 }}>
              {fmtVol(grandTotal)}<span style={{ fontSize: "10px", color: SB, fontWeight: 500, marginLeft: "2px" }}>lbs</span>
            </div>
            <div style={{ fontSize: "9px", color: SB, marginTop: "3px", letterSpacing: "0.06em", fontWeight: 600, textTransform: "uppercase" }}>
              8-week total
            </div>
          </div>
        </div>

        {/* Week-over-week summary chip */}
        {totalPrior > 0 && (
          <div style={{
            marginTop: "10px",
            display: "inline-flex", alignItems: "center", gap: "6px",
            padding: "6px 10px", borderRadius: "8px",
            background: trendPct === 0 ? `${MT}` : (trendPct > 0 ? `${A}14` : "#FF6B6B14"),
            border: `1px solid ${trendPct === 0 ? BD : (trendPct > 0 ? `${A}44` : "#FF6B6B44")}`,
          }}>
            <span style={{ fontSize: "12px", color: trendPct === 0 ? SB : (trendPct > 0 ? A : "#FF6B6B"), fontWeight: 800 }}>
              {trendPct > 0 ? `↑ ${trendPct}%` : trendPct < 0 ? `↓ ${Math.abs(trendPct)}%` : "— 0%"}
            </span>
            <span style={{ fontSize: "11px", color: SB }}>
              this week vs last week
            </span>
          </div>
        )}
      </div>

      {/* ── Per-type rows ───────────────────────────────────────────────── */}
      <div style={{
        fontSize: "9px", color: SB, letterSpacing: "0.08em", fontWeight: 600,
        textTransform: "uppercase",
        display: "grid", gridTemplateColumns: "80px 1fr 70px",
        gap: "10px",
        padding: "6px 0",
        borderBottom: `1px solid ${BD}`,
      }}>
        <div>Type</div>
        <div style={{ textAlign: "center" }}>
          8-week trend {hoverIdx !== null && <span style={{ color: A, textTransform: "none", letterSpacing: 0, fontWeight: 500 }}>· {hoverLabel}</span>}
        </div>
        <div style={{ textAlign: "right" }}>{isCurrentWeek ? "This wk" : "That wk"}</div>
      </div>

      <div style={{ display: "flex", flexDirection: "column" }}>
        {rows.map((r, i) => {
          const color = TYPE_COLORS[r.type] || A;
          const shownVal = hoverIdx !== null ? r.series[hoverIdx] : r.latest;
          const up = r.delta > 0;
          const flat = r.delta === 0;
          return (
            <div
              key={r.type}
              style={{
                display: "grid", gridTemplateColumns: "80px 1fr 70px",
                gap: "10px",
                alignItems: "center",
                padding: "10px 0",
                borderTop: i === 0 ? "none" : `1px solid ${BD}`,
              }}
            >
              {/* Type label */}
              <div style={{ minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: color, boxShadow: `0 0 6px ${color}` }}/>
                  <div style={{ fontSize: "13px", fontWeight: 700, color: TX, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {r.type}
                  </div>
                </div>
                <div style={{ fontSize: "10px", color: SB, marginTop: "3px", marginLeft: "14px" }}>
                  total {fmtVol(r.total)} lbs
                </div>
              </div>

              {/* Sparkline */}
              <div style={{ display: "flex", justifyContent: "center" }}>
                <Sparkline
                  values={r.series}
                  color={color}
                  width={160}
                  height={34}
                  onPointHover={setHoverIdx}
                />
              </div>

              {/* Value + WoW */}
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: "13px", fontWeight: 800, color: TX, letterSpacing: "-0.01em", lineHeight: 1 }}>
                  {fmtVol(shownVal)}
                  <span style={{ fontSize: "9px", color: SB, fontWeight: 500, marginLeft: "2px" }}>lbs</span>
                </div>
                <div style={{
                  fontSize: "10px", fontWeight: 700, marginTop: "3px",
                  color: flat ? SB : (up ? A : "#FF6B6B"),
                }}>
                  {flat ? "no change" : (up ? "▲" : "▼") + " " + fmtVol(Math.abs(r.delta))}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer hint */}
      <div style={{
        marginTop: "10px", paddingTop: "10px", borderTop: `1px solid ${BD}`,
        fontSize: "10px", color: SB, textAlign: "center", lineHeight: 1.5,
      }}>
        {hoverIdx === null ? (
          <>Tap a line to see any week &middot; rightmost dot = this week</>
        ) : (
          <>Showing <span style={{ color: TX, fontWeight: 700 }}>{hoverLabel}</span> &middot; tap away to reset</>
        )}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
// 3. PR TIMELINE — chronological list of personal records
// ────────────────────────────────────────────────────────────────────────
export function AthletePRTimeline({ history }) {
  const prs = React.useMemo(() => {
    if (!history || history.length === 0) return [];
    const chronological = [...history].reverse();
    const best = {}; // exercise -> { weight, reps }
    const events = [];
    for (const s of chronological) {
      for (const ex of s.exercises || []) {
        let maxW = 0;
        let bestReps = 0;
        for (const set of ex.sets || []) {
          const w = parseFloat(set.w) || 0;
          const r = parseInt(set.r, 10) || 0;
          if (w > maxW || (w === maxW && r > bestReps)) {
            maxW = w;
            bestReps = r;
          }
        }
        if (maxW <= 0) continue;
        const prev = best[ex.name];
        if (!prev || maxW > prev.weight) {
          const delta = prev ? +(maxW - prev.weight).toFixed(1) : null;
          best[ex.name] = { weight: maxW, reps: bestReps };
          events.push({
            date: s.date,
            exercise: ex.name,
            weight: maxW,
            reps: bestReps,
            delta,
            type: s.type,
          });
        }
      }
    }
    // newest first, cap 8
    return events.reverse().slice(0, 8);
  }, [history]);

  if (prs.length === 0) return null;

  return (
    <div style={cardStyle}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "12px" }}>
        <div style={cardLabel}>Personal records</div>
        <div style={{ fontSize: "10px", color: SB }}>{prs.length} recent</div>
      </div>

      {/* Timeline rail on the left */}
      <div style={{ position: "relative", paddingLeft: "18px" }}>
        <div style={{
          position: "absolute", left: "5px", top: "8px", bottom: "8px",
          width: "1px", background: `linear-gradient(180deg, ${A}66, ${MT} 60%)`,
        }}/>
        {prs.map((pr, i) => (
          <div
            key={i}
            style={{
              display: "flex", alignItems: "center", gap: "12px",
              padding: "8px 0",
              position: "relative",
            }}
          >
            {/* Node */}
            <div style={{
              position: "absolute", left: "-18px", top: "50%", transform: "translateY(-50%)",
              width: "10px", height: "10px", borderRadius: "50%",
              background: BG,
              border: `1px solid ${A}`,
              boxShadow: `0 0 6px ${A}66`,
            }}>
              <div style={{
                position: "absolute", inset: "2px", borderRadius: "50%", background: A,
              }}/>
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: "13px", fontWeight: 700, color: TX, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {pr.exercise}
              </div>
              <div style={{ fontSize: "10px", color: SB, marginTop: "2px", letterSpacing: "0.02em" }}>
                {new Date(pr.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                {pr.reps > 0 && ` · ${pr.reps} reps`}
              </div>
            </div>

            <div style={{ textAlign: "right", flexShrink: 0 }}>
              <div style={{ fontSize: "15px", fontWeight: 800, color: TX, lineHeight: 1, letterSpacing: "-0.01em" }}>
                {pr.weight}
                <span style={{ fontSize: "9px", color: SB, fontWeight: 500, marginLeft: "3px" }}>lbs</span>
              </div>
              {pr.delta !== null && (
                <div style={{ fontSize: "9px", color: A, marginTop: "3px", fontWeight: 700 }}>+{pr.delta} lbs</div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
// 4. SESSION DRAWER — bottom sheet with full sets table
// ────────────────────────────────────────────────────────────────────────
export function AthleteSessionDrawer({ session, onClose }) {
  const [expanded, setExpanded] = React.useState(false);
  const scrollRef = React.useRef(null);

  // Lock body scroll; handle Esc to close; reset expanded on open
  React.useEffect(() => {
    if (!session) { setExpanded(false); return; }
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [session, onClose]);

  // Swipe-down-to-close + swipe-up-to-expand on the grab handle
  const touchRef = React.useRef({ y0: 0, active: false });
  const onHandleTouchStart = (e) => { touchRef.current = { y0: e.touches[0].clientY, active: true }; };
  const onHandleTouchMove  = (e) => {
    if (!touchRef.current.active) return;
    const dy = e.touches[0].clientY - touchRef.current.y0;
    if (dy < -20 && !expanded) { setExpanded(true); touchRef.current.active = false; }
    else if (dy > 80) { touchRef.current.active = false; onClose?.(); }
  };
  const onHandleTouchEnd = () => { touchRef.current.active = false; };

  if (!session) return null;

  const mins = Math.round((session.duration || 0) / 60);
  const color = TYPE_COLORS[session.type] || A;

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 260, background: "rgba(0,0,0,0.6)" }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          position: "absolute", bottom: 0, left: "50%", transform: "translateX(-50%)",
          width: "100%", maxWidth: 480,
          background: S1, borderRadius: "20px 20px 0 0",
          padding: "8px 16px 40px",
          // Always feel like a proper bottom sheet: min 70vh, snap to ~94vh on expand
          minHeight: expanded ? "94vh" : "70vh",
          maxHeight: expanded ? "94vh" : "70vh",
          height: expanded ? "94vh" : "70vh",
          display: "flex", flexDirection: "column",
          fontFamily: "inherit",
          animation: "drawerUp 0.28s cubic-bezier(0.2, 0.8, 0.2, 1)",
          transition: "min-height 0.28s cubic-bezier(0.2, 0.8, 0.2, 1), max-height 0.28s cubic-bezier(0.2, 0.8, 0.2, 1), height 0.28s cubic-bezier(0.2, 0.8, 0.2, 1)",
          boxShadow: "0 -8px 32px rgba(0,0,0,0.45)",
        }}
      >
        {/* Drag handle — tap or swipe up to expand, swipe down to close */}
        <div
          onClick={() => setExpanded(v => !v)}
          onTouchStart={onHandleTouchStart}
          onTouchMove={onHandleTouchMove}
          onTouchEnd={onHandleTouchEnd}
          style={{
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            padding: "10px 0 12px", cursor: "pointer", flexShrink: 0,
            touchAction: "none",
          }}
        >
          <div style={{
            width: "44px", height: "5px", borderRadius: "3px", background: MT,
            transition: "background 0.2s",
          }}/>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px", flexShrink: 0 }}>
          <div>
            <div style={{
              display: "inline-block",
              background: `${color}15`, color, padding: "3px 10px",
              borderRadius: "6px", fontSize: "11px", fontWeight: 800,
              letterSpacing: "0.04em", marginBottom: "6px",
            }}>
              {session.type || "Workout"}
            </div>
            <div style={{ fontSize: "17px", fontWeight: 800, color: TX }}>
              {new Date(session.date).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}
            </div>
            <div style={{ fontSize: "12px", color: SB, marginTop: "2px" }}>
              {session.totalSets || 0} sets
              {mins > 0 && ` · ${mins} min`}
              {session.totalVolume > 0 && ` · ${session.totalVolume.toLocaleString()} lbs volume`}
            </div>
          </div>
          <button onClick={onClose} style={{ background: MT, border: "none", borderRadius: "8px", padding: "6px 12px", color: TX, fontSize: "12px", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
            Close
          </button>
        </div>

        {/* Scrollable exercise list — takes remaining vertical space */}
        <div
          ref={scrollRef}
          style={{
            flex: 1,
            overflowY: "auto",
            WebkitOverflowScrolling: "touch",
            overscrollBehavior: "contain",
            paddingBottom: "20px",
          }}
        >
          {session.exercises && session.exercises.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {session.exercises.map((ex, i) => (
                <div key={i} style={{ background: S2, borderRadius: "12px", padding: "12px 14px", border: `1px solid ${BD}` }}>
                  <div style={{ fontSize: "14px", fontWeight: 700, color: TX, marginBottom: "10px" }}>{ex.name}</div>
                  {ex.sets && ex.sets.length > 0 ? (
                    <div style={{ display: "grid", gridTemplateColumns: "auto 1fr 1fr", gap: "6px 12px", fontSize: "12px" }}>
                      <div style={{ color: SB, fontSize: "10px", letterSpacing: "0.06em" }}>SET</div>
                      <div style={{ color: SB, fontSize: "10px", letterSpacing: "0.06em" }}>WEIGHT</div>
                      <div style={{ color: SB, fontSize: "10px", letterSpacing: "0.06em" }}>REPS</div>
                      {ex.sets.map((s, j) => (
                        <React.Fragment key={j}>
                          <div style={{ color: SB }}>{j + 1}</div>
                          <div style={{ color: TX, fontWeight: 600 }}>{s.w || "—"}</div>
                          <div style={{ color: TX, fontWeight: 600 }}>{s.r || "—"}</div>
                        </React.Fragment>
                      ))}
                    </div>
                  ) : (
                    <div style={{ fontSize: "12px", color: SB }}>No sets logged.</div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div style={{ color: SB, fontSize: "13px", textAlign: "center", padding: "24px 0" }}>
              No exercises recorded.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
