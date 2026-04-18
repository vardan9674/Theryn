export const SEVERITY_COLORS: Record<string, string> = { low: "#C8FF00", medium: "#FFD166", high: "#FF5C5C" };
export function detectSignals(_data: unknown[]): unknown[] { return []; }
export function summarizeForRow(_row: unknown): string { return ""; }
export function computeStats(_data: unknown[]): Record<string, unknown> { return {}; }
export function computeBMI(weight: number, height: number): number { return weight / ((height / 100) ** 2); }
export function bmiCategory(bmi: number): string {
  if (bmi < 18.5) return "Underweight";
  if (bmi < 25) return "Normal";
  if (bmi < 30) return "Overweight";
  return "Obese";
}
