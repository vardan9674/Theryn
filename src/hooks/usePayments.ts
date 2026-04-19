import { supabase } from "../lib/supabase";

// ── Types ───────────────────────────────────────────────────────────────
export type Cadence = "weekly" | "monthly" | "quarterly" | "yearly";

export interface ClientFee {
  id: string;
  coach_id: string;
  athlete_id: string;
  amount: number;
  currency: string;
  cadence: Cadence;
  start_date: string; // YYYY-MM-DD
  active: boolean;
  notes: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface PaymentEntry {
  id: string;
  coach_id: string;
  athlete_id: string;
  amount: number;
  currency: string;
  received_date: string; // YYYY-MM-DD
  notes: string | null;
  created_at?: string;
}

// ── Currencies ──────────────────────────────────────────────────────────
export const SUPPORTED_CURRENCIES: Array<{ code: string; symbol: string; label: string }> = [
  { code: "USD", symbol: "$",    label: "US Dollar" },
  { code: "EUR", symbol: "€",    label: "Euro" },
  { code: "GBP", symbol: "£",    label: "British Pound" },
  { code: "INR", symbol: "₹",    label: "Indian Rupee" },
  { code: "CAD", symbol: "C$",   label: "Canadian Dollar" },
  { code: "AUD", symbol: "A$",   label: "Australian Dollar" },
  { code: "SGD", symbol: "S$",   label: "Singapore Dollar" },
  { code: "AED", symbol: "AED ", label: "UAE Dirham" },
];

export function currencySymbol(code: string): string {
  return SUPPORTED_CURRENCIES.find(c => c.code === code)?.symbol ?? `${code} `;
}

/** Formats a monetary amount with the correct symbol + thousands separators. */
export function fmtMoney(amount: number | null | undefined, currency: string = "USD"): string {
  const sym = currencySymbol(currency);
  const n = Number(amount);
  if (!Number.isFinite(n)) return `${sym}—`;
  const whole = Math.round(n) === n;
  const body = whole
    ? n.toLocaleString("en-US")
    : n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${sym}${body}`;
}

// ── Fee CRUD ────────────────────────────────────────────────────────────
export async function loadClientFees(coachId: string): Promise<ClientFee[]> {
  const { data, error } = await supabase
    .from("coach_client_fees")
    .select("*")
    .eq("coach_id", coachId);
  if (error) throw new Error(error.message);
  return (data || []).map(row => ({
    ...row,
    amount: Number(row.amount),
  })) as ClientFee[];
}

export interface FeeInput {
  amount: number | string;
  currency?: string;
  cadence?: Cadence;
  start_date?: string;
  active?: boolean;
  notes?: string | null;
}

export async function upsertClientFee(
  coachId: string,
  athleteId: string,
  input: FeeInput
): Promise<ClientFee> {
  const payload = {
    coach_id: coachId,
    athlete_id: athleteId,
    amount: Number(input.amount),
    currency: input.currency || "USD",
    cadence: input.cadence || "monthly",
    start_date: input.start_date || new Date().toISOString().split("T")[0],
    active: input.active !== false,
    notes: input.notes ?? null,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await supabase
    .from("coach_client_fees")
    .upsert(payload, { onConflict: "coach_id,athlete_id" })
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message || "Failed to save fee");
  return { ...data, amount: Number(data.amount) } as ClientFee;
}

export async function deleteClientFee(id: string): Promise<void> {
  const { error } = await supabase.from("coach_client_fees").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

// ── Payment CRUD ────────────────────────────────────────────────────────
export async function loadPayments(
  coachId: string,
  { limit = 200 }: { limit?: number } = {}
): Promise<PaymentEntry[]> {
  const { data, error } = await supabase
    .from("coach_payments")
    .select("*")
    .eq("coach_id", coachId)
    .order("received_date", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data || []).map(row => ({
    ...row,
    amount: Number(row.amount),
  })) as PaymentEntry[];
}

export interface PaymentInput {
  amount: number | string;
  currency?: string;
  received_date?: string;
  notes?: string | null;
}

export async function savePayment(
  coachId: string,
  athleteId: string,
  input: PaymentInput
): Promise<PaymentEntry> {
  const payload = {
    coach_id: coachId,
    athlete_id: athleteId,
    amount: Number(input.amount),
    currency: input.currency || "USD",
    received_date: input.received_date || new Date().toISOString().split("T")[0],
    notes: input.notes ?? null,
  };
  const { data, error } = await supabase
    .from("coach_payments")
    .insert(payload)
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message || "Failed to save payment");
  return { ...data, amount: Number(data.amount) } as PaymentEntry;
}

export async function deletePayment(id: string): Promise<void> {
  const { error } = await supabase.from("coach_payments").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

// ── Pure math — cycle boundaries + status ──────────────────────────────
// Given a fee's anchor date and cadence, find the start of the billing
// cycle that contains `refDate`. All comparisons use local midday to dodge
// DST/timezone edges.
function atMidday(iso: string): Date { return new Date(iso + "T12:00:00"); }

export function cycleStartForDate(cadence: Cadence, anchorIso: string, refDate: Date = new Date()): Date {
  const anchor = atMidday(anchorIso);
  const ref = new Date(refDate);
  ref.setHours(12, 0, 0, 0);
  switch (cadence) {
    case "weekly": {
      const weeks = Math.floor((ref.getTime() - anchor.getTime()) / (7 * 86400000));
      return new Date(anchor.getTime() + weeks * 7 * 86400000);
    }
    case "monthly": {
      const start = new Date(ref.getFullYear(), ref.getMonth(), anchor.getDate(), 12, 0, 0, 0);
      if (start > ref) start.setMonth(start.getMonth() - 1);
      return start;
    }
    case "quarterly": {
      const monthsSince =
        (ref.getFullYear() - anchor.getFullYear()) * 12 + (ref.getMonth() - anchor.getMonth());
      const quarters = Math.floor(monthsSince / 3);
      const start = new Date(anchor);
      start.setMonth(anchor.getMonth() + quarters * 3);
      return start;
    }
    case "yearly": {
      const start = new Date(anchor);
      start.setFullYear(ref.getFullYear());
      if (start > ref) start.setFullYear(start.getFullYear() - 1);
      return start;
    }
  }
}

export function cycleEndForStart(cadence: Cadence, start: Date): Date {
  const end = new Date(start);
  switch (cadence) {
    case "weekly":    end.setDate(end.getDate() + 6); break;
    case "monthly":   end.setMonth(end.getMonth() + 1); end.setDate(end.getDate() - 1); break;
    case "quarterly": end.setMonth(end.getMonth() + 3); end.setDate(end.getDate() - 1); break;
    case "yearly":    end.setFullYear(end.getFullYear() + 1); end.setDate(end.getDate() - 1); break;
  }
  end.setHours(23, 59, 59, 999);
  return end;
}

export type AthleteStatus = "paid" | "due" | "overdue" | "no_fee";

export interface AthleteStatusInfo {
  status: AthleteStatus;
  label: string;
  lastPayment: PaymentEntry | null;
  cycleStart: Date | null;
  cycleEnd: Date | null;
  fee: ClientFee | null;
}

/**
 * For a given athlete: paid if any payment lands in the current cycle,
 * overdue if the cycle has ended with no payment, due if the cycle is still
 * open. no_fee if no fee is configured (yet).
 */
export function athletePaymentStatus(
  fee: ClientFee | null,
  athletePayments: PaymentEntry[],
  refDate: Date = new Date()
): AthleteStatusInfo {
  const lastPayment = athletePayments[0] || null;
  if (!fee || !fee.active) {
    return { status: "no_fee", label: "No fee set", lastPayment, cycleStart: null, cycleEnd: null, fee };
  }
  const cycleStart = cycleStartForDate(fee.cadence, fee.start_date, refDate);
  const cycleEnd = cycleEndForStart(fee.cadence, cycleStart);
  const matching = athletePayments.find(p => {
    const d = atMidday(p.received_date);
    return d >= cycleStart && d <= cycleEnd;
  });
  if (matching) {
    return { status: "paid", label: "Paid", lastPayment: matching, cycleStart, cycleEnd, fee };
  }
  if (refDate > cycleEnd) {
    return { status: "overdue", label: "Overdue", lastPayment, cycleStart, cycleEnd, fee };
  }
  return { status: "due", label: "Due", lastPayment, cycleStart, cycleEnd, fee };
}

export interface MonthlySummary {
  receivedThisMonth: number;
  expectedThisMonth: number;
  outstanding: number;
}

/**
 * Month = calendar month containing `refDate`. Expected is pro-rated from
 * cadence: a weekly $50 fee → $50 × 52/12 ≈ $216.67/month; quarterly $300
 * fee → $100/month; yearly $1200 → $100/month.
 *
 * NOTE: assumes the coach has one primary currency (profile.default_currency).
 * Mixed-currency totals aren't converted — the first-row currency wins
 * visually, and the coach should use consistent currencies within their
 * dashboard. Mixed-currency conversion is a Phase-2 problem.
 */
export function computeMonthlySummary(
  fees: ClientFee[],
  payments: PaymentEntry[],
  refDate: Date = new Date()
): MonthlySummary {
  const month = refDate.getMonth();
  const year = refDate.getFullYear();

  const receivedThisMonth = payments
    .filter(p => {
      const d = atMidday(p.received_date);
      return d.getMonth() === month && d.getFullYear() === year;
    })
    .reduce((sum, p) => sum + Number(p.amount), 0);

  const expectedThisMonth = fees
    .filter(f => f.active)
    .reduce((sum, f) => {
      const amt = Number(f.amount);
      switch (f.cadence) {
        case "weekly":    return sum + amt * (52 / 12);
        case "monthly":   return sum + amt;
        case "quarterly": return sum + amt / 3;
        case "yearly":    return sum + amt / 12;
        default:          return sum;
      }
    }, 0);

  return {
    receivedThisMonth: Number(receivedThisMonth.toFixed(2)),
    expectedThisMonth: Number(expectedThisMonth.toFixed(2)),
    outstanding: Number(Math.max(0, expectedThisMonth - receivedThisMonth).toFixed(2)),
  };
}
