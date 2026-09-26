import { supabase } from "./supabase";

// "Wrong muscle?" reports from the exercise info sheet.
// Server side: report_exercise_muscle() in migration 20260926193523_exercise_muscle_reports.sql.

/** Plain-language message for a failed report. */
export function friendlyReportError(error) {
  const code = error?.code || "";
  const msg = String(error?.message || "");
  if (code === "23505") return "You've already reported this exercise. We'll look into it.";
  if (code === "42501" || /sign in/i.test(msg)) return "Sign in to send a report.";
  if (code === "54000") return "You have a lot of open reports. Please wait until we've checked some of them.";
  if (code === "PGRST202" || code === "42883" || /unknown exercise|does not exist|Could not find the function/i.test(msg)) {
    return "Reports aren't switched on yet. Please try again later.";
  }
  if (/fetch|network|Failed to fetch|timeout/i.test(msg)) return "Couldn't send. Check your connection and try again.";
  return "Couldn't send the report. Please try again.";
}

/** Sends a report. Resolves on success; rejects with an Error whose message is safe to show. */
export async function reportWrongMuscle({ exerciseRef, suggested, note }) {
  let res;
  try {
    res = await supabase.rpc("report_exercise_muscle", {
      p_exercise: exerciseRef,
      p_suggested: suggested,
      p_note: note && note.trim() ? note.trim().slice(0, 300) : null,
    });
  } catch (e) {
    throw new Error(friendlyReportError(e));
  }
  if (res.error) throw new Error(friendlyReportError(res.error));
  return res.data;
}
