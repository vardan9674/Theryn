# Theryn — Design & Style Memo
> **For AI assistants**: This document is the canonical source of truth for the Theryn app's visual identity, component patterns, and interaction rules. **Do not change the theme, colors, font stack, or component styles without explicit user instruction.** When adding new features, match all patterns described below exactly.

---

## 1. App Identity

| Field | Value |
|---|---|
| **App Name** | Theryn |
| **Purpose** | Personal gym & body tracking — workouts, body weight, body measurements, PRs, weekly progress |
| **Target Form Factor** | Mobile-first, fixed 390 px max-width, rendered in a browser at 100 vh |
| **Tone** | Minimal, athletic, dark, high-contrast |

---

## 2. Color Tokens

These are the **only** colors used in Theryn. Never introduce new colors without user approval.

| Token | Hex | Role |
|---|---|---|
| `A` | `#C8FF00` | **Accent / Primary action** — lime-green. Used for active states, highlights, positive deltas, the Log Measurements button, active tab, PR values. |
| `BG` | `#080808` | **Page background** — near-black. |
| `S1` | `#101010` | **Card surface** — slightly lighter than background. |
| `S2` | `#181818` | **Elevated card surface** — used for "today" cards and input backgrounds. |
| `BD` | `#1E1E1E` | **Border / Divider** — subtle separation between cards and sections. |
| `TX` | `#F0F0F0` | **Primary text** — off-white. Used for headings and values. |
| `SB` | `#585858` | **Secondary / Muted text** — used for sub-labels, helper text, inactive states. |
| `MT` | `#2C2C2C` | **Muted / Placeholder** — used for empty states, disabled borders, removed-set buttons. |
| `RED` | `#FF5C5C` | **Danger / Negative delta** — used for Delete buttons and weight gained. |

### Accent Usage Rules
- `A` (lime) = **positive / active / primary call-to-action**
- `RED` = **danger or weight gain**
- Teal `#4ECDC4` = **measurement decreased** (good direction for body fat metrics)
- Weight *down* → `A` (lime). Weight *up* → `RED`.
- Measurement *up* (e.g. muscle) → `A`. Measurement *down* → `#4ECDC4`.

---

## 3. Typography

```
fontFamily: "-apple-system, 'Helvetica Neue', Helvetica, sans-serif"
```

No Google Fonts. No custom web fonts. The system font stack keeps it native and fast.

| Usage | Size | Weight | Notes |
|---|---|---|---|
| Screen title | `30px` | `700` | Letter spacing `-0.04em` |
| Section sub-label | `10px` | default | Uppercase, `letter-spacing: 0.1em`, color `SB` |
| Card primary value (large) | `48px` | `700` | Letter spacing `-0.05em`, color `A` |
| Card primary value (medium) | `20–26px` | `700` | Letter spacing `-0.03em` |
| Card body text | `13–15px` | `500–600` | |
| Small helper / unit | `10–12px` | default | Color `SB` |
| Tab label | `9px` | `400`/`600` active | Uppercase, letter-spacing `0.06em` |

---

## 4. Layout

- **Max width**: `390px`, centered (`margin: 0 auto`)
- **Page background**: `BG` (`#080808`)
- **Bottom padding**: `76px` to clear the fixed tab bar
- **Tab bar**: Fixed, bottom `0`, full width, `backdrop-filter: blur(16px)`, `background: rgba(8,8,8,0.96)`, `border-top: 1px solid BD`
- **Screen header**: `padding: 52px 24px 24px`, `border-bottom: 1px solid BD`
- **Content padding**: `12–14px` on left/right inside screens

---

## 5. Component Styles

### Card
```js
{ background: S1, borderRadius: "12px", border: `1px solid ${BD}`, padding: "14px 18px", marginBottom: "8px" }
```
Elevated "today" cards use `background: S2`.

### Sub-label
```js
{ fontSize: "10px", color: SB, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "4px" }
```

### Input
```js
{ background: S2, border: `1px solid ${BD}`, borderRadius: "8px", color: TX, fontSize: "16px", padding: "9px 14px", outline: "none", boxSizing: "border-box" }
```

### Primary Button (`btnPrim`)
```js
{ background: A, border: "none", borderRadius: "8px", color: "#000", fontWeight: "700", fontSize: "14px", padding: "11px 16px", cursor: "pointer" }
```
Black text on lime background. Used for all primary save/log actions.

### Ghost Button (`btnGhost`)
```js
{ background: "none", border: `1px solid ${MT}`, borderRadius: "8px", color: SB, fontSize: "14px", padding: "11px 16px", cursor: "pointer" }
```
Used for Cancel/secondary actions.

### Inline Action Buttons (Edit, Delete, ✕)
- Small: `padding: "3–4px 12px"`, `fontSize: "11px"`, `border: 1px solid MT`, `borderRadius: "6px"`
- Edit → color `SB`
- Delete → color `RED`
- Remove-set (✕) → `color: MT`, no border

### Dashed Add Button
```js
{ background: "none", border: `1px dashed ${MT}`, borderRadius: "12px", color: SB, padding: "16px", fontSize: "13px" }
```

### Chip / Tag (e.g. active measurement field)
```js
{ display: "inline-flex", alignItems: "center", gap: "4px", background: S2, border: `1px solid ${BD}`, borderRadius: "6px", padding: "4px 10px", fontSize: "12px", color: TX }
```

---

## 6. Navigation

5 tabs, fixed at the bottom:

| Tab ID | Label | Screen |
|---|---|---|
| `log` | Log | Today's workout session |
| `routine` | Routine | Weekly template editor |
| `body` | Body | Weight + body measurements |
| `progress` | Progress | Weekly volume chart + best lifts |
| `prs` | Records | All-time personal records |

Active tab color: `A` (lime). Inactive: `SB`.  
Icons: SVG inline, `20×20`, `strokeWidth: 1.8`, `strokeLinecap/Join: round`.

---

## 7. Workout Type Colors

Each workout type has its own accent color used in the Routine screen:

| Type | Color |
|---|---|
| Push | `#FF8C42` |
| Pull | `#4ECDC4` |
| Legs | `#A8E6CF` |
| Upper | `#C77DFF` |
| Lower | `#FFD166` |
| Full Body | `#C8FF00` (same as `A`) |
| Cardio | `#06D6A0` |
| Rest | `#585858` (same as `SB`) |

---

## 8. UX Patterns

- **Collapsible sections**: Toggle with a `⌄` chevron that rotates 180° when open (`transition: transform 0.2s`).
- **Inline editing**: Tapping "Edit" replaces the display value with an input + Save/Cancel buttons in-place. No modals.
- **Bottom sheet / Save prompt**: Full-screen overlay `rgba(0,0,0,0.72)` with a sheet rising from the bottom (`borderRadius: "20px 20px 0 0"`). A pill handle `(36px × 4px, background: MT)` sits at the top.
- **Delta indicators**: Shown inline next to values as small colored spans. Always `fontWeight: 600`, `fontSize: 11px`.
- **Empty states**: Short muted text in `MT` or `SB`, no illustrations.
- **"TODAY" badge**: `background: A`, `color: #000`, `fontSize: 9px`, `borderRadius: 4px`, `padding: 2px 6px`, `fontWeight: 700`.

---

## 9. Source File

The entire app is a single self-contained React JSX file using:
- **React** (hooks only — `useState`)
- **Recharts** (`BarChart`, `Bar`, `XAxis`, `Cell`, `ResponsiveContainer`, `Tooltip`) for the progress chart
- No CSS files — all styling is inline JS style objects
- No external UI libraries

**File location**: `/Users/vardanchennupati/Downloads/Code & Scripts/2026-04/2026-04-03_gym-app.jsx`  
**Dev server**: Run from `/Users/vardanchennupati/.gemini/antigravity/scratch/gym-app/` with `npm run dev` (Vite, port 5173).

---

## 10. Rules for AI Assistants

1. **Never change the color tokens.** All 9 tokens (`A`, `BG`, `S1`, `S2`, `BD`, `TX`, `SB`, `MT`, `RED`) are sacred.
2. **Never introduce new fonts.** Use the system font stack only.
3. **All new cards must follow the `card` style object** — same border-radius, border, background.
4. **All primary actions use `btnPrim`.** All secondary/cancel actions use `btnGhost`.
5. **Inline editing only** — never add modals or separate pages for editing values.
6. **Mobile-first, 390 px max-width** — never exceed this or use desktop-style layouts.
7. **Positive metric changes** (weight down, muscle up) → `A` (lime). Negative → `RED` or `#4ECDC4` depending on context.
8. **Keep the tab bar fixed** — do not modify the tab bar structure or add/remove tabs without user instruction.
9. When adding new screens or sections, open with a `<ScreenHeader sup="..." title="..."/>` component at the top.
10. **App name is Theryn** — use this name in any branding, titles, or descriptions.
