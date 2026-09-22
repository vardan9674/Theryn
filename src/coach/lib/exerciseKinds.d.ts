// Types for exerciseKinds.js (used from TypeScript by the Excel export).
export function defaultMode(name: string): "reps" | "time";
export function defaultSecs(name: string): number;
export function parseDuration(raw: unknown): number | null;
export function formatDuration(secs: unknown): string;
export function clock(secs: unknown): string;
export function durationInput(secs: unknown): string;
export function maskDuration(raw: unknown): string;
export function tidyDuration(raw: unknown): string;
export function supersetInfo(exercises: unknown[]): ({ letter: string; pos: number; size: number } | null)[];
export function normalizeSupersets<T>(exercises: T[]): T[];
