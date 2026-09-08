// Build an Excel workbook from a client's weekly plan: one sheet per training
// day, columns Exercise · Sets · Reps · Weight · Coach note.
// The row-building is pure and unit-tested; the file writing uses SheetJS.
import type { Templates, ExerciseItem } from "../../hooks/useRoutine";
import type { WorkoutHistoryEntry } from "../../hooks/useWorkouts";

export interface ExportOptions {
  /** Fill the Weight column with the heaviest weight lifted in the most recent session containing that exercise. */
  includeLastWeights?: boolean;
  /** Add empty "Done · Sets / Reps / Weight" columns for the client to fill in by hand. */
  blankColumns?: boolean;
  history?: WorkoutHistoryEntry[] | null;
  unit?: "lb" | "kg";
}

export interface SheetSpec {
  name: string;
  rows: (string | number)[][];
  /** Column widths in characters, in the same order as the header row. */
  widths: number[];
}

const DAY_ORDER = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DAY_LONG: Record<string, string> = {
  Mon: "Monday", Tue: "Tuesday", Wed: "Wednesday", Thu: "Thursday", Fri: "Friday", Sat: "Saturday", Sun: "Sunday",
};

function exName(ex: ExerciseItem): string {
  return typeof ex === "string" ? ex : (ex?.name || "");
}
function exField(ex: ExerciseItem, key: "sets" | "reps" | "weight" | "coachNote"): string {
  if (typeof ex === "string" || !ex) return "";
  const v = (ex as any)[key];
  return v == null || v === "" ? "" : String(v);
}

/** Heaviest weight in the most recent session that includes this exercise. */
export function lastLiftedWeight(history: WorkoutHistoryEntry[] | null | undefined, name: string): number | null {
  if (!history || !name) return null;
  const target = name.trim().toLowerCase();
  const sorted = [...history].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  for (const session of sorted) {
    const ex = session.exercises?.find((e) => (e.name || "").trim().toLowerCase() === target);
    if (!ex) continue;
    let best: number | null = null;
    for (const s of ex.sets || []) {
      const w = Number(s.w);
      if (Number.isFinite(w) && w > 0 && (best == null || w > best)) best = w;
    }
    if (best != null) return best;
  }
  return null;
}

/** Excel sheet names: max 31 chars, none of : \ / ? * [ ] */
export function safeSheetName(name: string): string {
  return name.replace(/[:\\/?*\[\]]/g, " ").trim().slice(0, 31) || "Sheet";
}

export function buildPlanSheets(templates: Templates, opts: ExportOptions = {}): SheetSpec[] {
  const unit = opts.unit || "lb";
  const sheets: SheetSpec[] = [];
  for (const day of DAY_ORDER) {
    const t = templates?.[day];
    if (!t || !t.type || t.type === "Rest") continue;
    const exercises = (t.exercises || []).filter((e) => exName(e));
    if (exercises.length === 0) continue;

    const header: string[] = ["#", "Exercise", "Sets", "Reps", `Weight (${unit})`, "Coach note"];
    const widths = [4, 30, 6, 8, 12, 40];
    if (opts.blankColumns) {
      header.push("Done sets", "Done reps", `Done weight (${unit})`, "How it felt");
      widths.push(10, 10, 14, 24);
    }
    const rows: (string | number)[][] = [header];
    exercises.forEach((ex, i) => {
      const name = exName(ex);
      let weight: string | number = exField(ex, "weight");
      if (opts.includeLastWeights) {
        const last = lastLiftedWeight(opts.history, name);
        if (last != null) weight = last;
      }
      const row: (string | number)[] = [i + 1, name, exField(ex, "sets"), exField(ex, "reps"), weight, exField(ex, "coachNote")];
      if (opts.blankColumns) row.push("", "", "", "");
      rows.push(row);
    });
    sheets.push({ name: safeSheetName(`${DAY_LONG[day]} - ${t.type}`), rows, widths });
  }
  return sheets;
}

/** A file name like "Priya-S-plan.xlsx". */
export function planFileName(clientName: string): string {
  const base = (clientName || "client").trim().replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "client";
  return `${base}-plan.xlsx`;
}

/** Produce the .xlsx bytes. Loaded lazily so the library is not in the main bundle. */
export async function buildPlanWorkbook(templates: Templates, opts: ExportOptions = {}): Promise<Uint8Array> {
  const XLSX = await import("xlsx");
  const sheets = buildPlanSheets(templates, opts);
  const wb = XLSX.utils.book_new();
  if (sheets.length === 0) {
    const ws = XLSX.utils.aoa_to_sheet([["This plan has no training days yet."]]);
    XLSX.utils.book_append_sheet(wb, ws, "Plan");
  }
  for (const s of sheets) {
    const ws = XLSX.utils.aoa_to_sheet(s.rows);
    ws["!cols"] = s.widths.map((wch) => ({ wch }));
    XLSX.utils.book_append_sheet(wb, ws, s.name);
  }
  const out = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  return new Uint8Array(out as ArrayBuffer);
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
  }
  return btoa(binary);
}

export type DeliverResult = "downloaded" | "shared" | "cancelled";

/**
 * Hand the file to the user. On the web this downloads; on iOS/Android it is
 * written to the cache directory and opened in the system share sheet.
 */
export async function deliverWorkbook(bytes: Uint8Array, filename: string, isNative: boolean): Promise<DeliverResult> {
  if (!isNative) {
    const blob = new Blob([bytes as unknown as BlobPart], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    return "downloaded";
  }
  const { Filesystem, Directory } = await import("@capacitor/filesystem");
  const { Share } = await import("@capacitor/share");
  const written = await Filesystem.writeFile({ path: filename, data: toBase64(bytes), directory: Directory.Cache });
  try {
    await Share.share({ title: filename, files: [written.uri] });
    return "shared";
  } catch (e: any) {
    if (/cancel/i.test(String(e?.message || e))) return "cancelled";
    throw e;
  }
}
