export const SEVERITY_COLORS: Record<string, string> = {
  low: "#C8FF00",
  medium: "#FFD166",
  high: "#FF5C5C",
  urgent: "#FF5C5C",
};

export function detectSignals(_data: unknown[]): unknown[] { return []; }
export function summarizeForRow(_row: unknown): { badges: unknown[]; primaryLine: string | null; primarySeverity: string | null; primaryTab: string | null } {
  return { badges: [], primaryLine: null, primarySeverity: null, primaryTab: null };
}
export function computeStats(_data: unknown[]): Record<string, unknown> { return {}; }

export type BMICategory = {
  label: string;
  color: string;
  range: string;
};

export function computeBMI(
  weight: number | null | undefined,
  heightCm: number | null | undefined,
  units: "metric" | "imperial" | string = "metric"
): number | null {
  if (!weight || !heightCm || weight <= 0 || heightCm <= 0) return null;
  const kg = units === "imperial" ? weight * 0.45359237 : weight;
  const m = heightCm / 100;
  const raw = kg / (m * m);
  if (!isFinite(raw) || raw <= 0) return null;
  return Math.round(raw);
}

export function bmiCategory(bmi: number | null | undefined): BMICategory {
  if (bmi == null) return { label: "", color: "#9CA3AF", range: "" };
  if (bmi < 18.5) return { label: "Underweight", color: "#60A5FA", range: "< 18.5" };
  if (bmi < 25)   return { label: "Normal",      color: "#C8FF00", range: "18.5 – 24" };
  if (bmi < 30)   return { label: "Overweight",  color: "#FFD166", range: "25 – 29" };
  return { label: "Obese", color: "#FF5C5C", range: "30+" };
}
