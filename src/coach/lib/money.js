// Totals across clients who pay in different currencies.
//
// Each fee and payment keeps the currency it was agreed in: a client paying
// $150 a month still owes $150. What the coach picks in Settings is the
// currency the *totals* are shown in. Amounts in other currencies are
// converted at today's rate and the total is marked "≈" — before this the
// numbers were added as if $1 and ₹1 were the same, and switching the setting
// only swapped the symbol.
import { fmtMoney } from "../../hooks/usePayments.ts";

// European Central Bank reference rates via Frankfurter: no key, no link to
// show. The ECB doesn't publish the UAE dirham; it is pegged to the dollar.
const RATES_URL = "https://api.frankfurter.dev/v1/latest?base=USD";
export const RATES_SOURCE = "European Central Bank";
const PEGGED = { AED: 3.6725 };
const CACHE_KEY = "theryn_fx_usd";
const FRESH_MS = 12 * 60 * 60 * 1000;

const storage = {
  get() { try { return JSON.parse(localStorage.getItem(CACHE_KEY) || "null"); } catch { return null; } },
  set(v) { try { localStorage.setItem(CACHE_KEY, JSON.stringify(v)); } catch { /* private mode */ } },
};

let inflight = null;

/**
 * Units of each currency per 1 USD, e.g. { USD: 1, INR: 95.9, … }, and the
 * day they're from. Cached for 12 hours; an older copy is used if the
 * network fails; null when there's nothing at all.
 */
export async function loadRates({ fetchImpl = globalThis.fetch, now = Date.now(), cache = storage } = {}) {
  const cached = cache.get();
  if (cached?.rates && now - cached.at < FRESH_MS) return cached;
  if (!inflight) {
    inflight = (async () => {
      try {
        const res = await fetchImpl(RATES_URL);
        const j = await res.json();
        if (!j?.rates || typeof j.rates.INR !== "number") throw new Error("bad rates");
        const fresh = { rates: { ...PEGGED, ...j.rates, USD: 1 }, day: /^\d{4}-\d{2}-\d{2}$/.test(j.date || "") ? j.date : null, at: now };
        cache.set(fresh);
        return fresh;
      } catch {
        return cached?.rates ? cached : null;
      } finally {
        inflight = null;
      }
    })();
  }
  return inflight;
}

/** Add amounts up per currency: { USD: 320, INR: 12000 }. */
export function sumByCurrency(items, amountOf, currencyOf, fallback = "USD") {
  const out = {};
  for (const it of items || []) {
    const n = Number(amountOf(it));
    if (!Number.isFinite(n) || n === 0) continue;
    const c = currencyOf(it) || fallback;
    out[c] = (out[c] || 0) + n;
  }
  return out;
}

/** `amount` in `from` → `to`, or null when either rate is missing. */
export function convert(amount, from, to, rates) {
  if (from === to) return amount;
  const a = rates?.[from], b = rates?.[to];
  if (!a || !b) return null;
  return (amount / a) * b;
}

const round = (n, cur) => (["INR", "AED"].includes(cur) || Math.abs(n) >= 1000 ? Math.round(n) : Math.round(n * 100) / 100);

/**
 * What a total card shows, in the coach's currency `to`.
 *   { main: "₹12,000", note: null, converted: false }              one currency, the coach's
 *   { main: "≈ ₹42,690", note: "$320 + ₹12,000", converted: true } converted at today's rate
 *   { main: "$320 + ₹12,000", note: null, converted: false }       no rates: say it as it is
 */
export function describeTotal(byCurrency, to, rates) {
  const entries = Object.entries(byCurrency || {}).filter(([, n]) => n);
  if (entries.length === 0) return { main: fmtMoney(0, to), note: null, converted: false };
  const breakdown = entries
    .sort(([a], [b]) => (a === to ? -1 : b === to ? 1 : a.localeCompare(b)))
    .map(([c, n]) => fmtMoney(round(n, c), c)).join(" + ");
  if (entries.length === 1 && entries[0][0] === to) return { main: fmtMoney(round(entries[0][1], to), to), note: null, converted: false };
  let total = 0;
  for (const [c, n] of entries) {
    const v = convert(n, c, to, rates);
    if (v == null) return { main: breakdown, note: null, converted: false };
    total += v;
  }
  return { main: `≈ ${fmtMoney(round(total, to), to)}`, note: breakdown, converted: true };
}
