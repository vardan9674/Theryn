// A day's name. Usually one of the ready-made ones (Push, Pull, Legs…), but a
// coach can type their own: "Biceps + Back", "Arms & Abs", "Fight Prep".
//
// The name travels a long way — the week strip on the client's phone, a pill
// on the coach's dashboard, an Excel sheet tab, a push notification — so it is
// kept short and tidy here, once, rather than defended for at each stop.
import { WORKOUT_TYPES } from "../../components/templates/tokens.js";

/** Long enough for "Shoulders + Arms", short enough for a 7-column week strip. */
export const MAX_TYPE_NAME = 24;

/** One line, single spaces, trimmed, capped. */
export function cleanTypeName(raw) {
  return String(raw ?? "").replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim().slice(0, MAX_TYPE_NAME);
}

/**
 * Why this name can't be used, in the coach's words, or null when it's fine.
 * "Rest" is not a name to type: a rest day is chosen from the list, and the
 * whole app — streaks, consistency, the client's link — keys off that exact
 * word, so a day called "rest" with exercises on it would read as empty.
 */
export function typeNameProblem(raw) {
  const t = cleanTypeName(raw);
  if (!t) return "Give the day a name.";
  if (/^(rest|off|rest day)$/i.test(t)) return "Pick Rest from the list for a rest day.";
  return null;
}

/** A name the coach typed, rather than one of the ready-made ones. */
export function isCustomTypeName(type) {
  const t = cleanTypeName(type);
  return Boolean(t) && !WORKOUT_TYPES.includes(t);
}
