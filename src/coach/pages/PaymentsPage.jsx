import React from "react";
import { Avatar, Button, Chip, Icon, Tone, Empty, Sheet, Field, Checkbox, useViewport, useToast } from "../ui/primitives.jsx";
import { paymentFact } from "../lib/clientFacts.js";
import { shortDate, isoDate, plural } from "../lib/format.js";
import { fmtMoney, computeMonthlySummary, SUPPORTED_CURRENCIES } from "../../hooks/usePayments.ts";

/**
 * Manual ledger. The coach writes down what each client paid; Theryn works
 * out who is due and who is late.
 */
export default function PaymentsPage({ clients, fees, payments, defaultCurrency, actions }) {
  const vp = useViewport();
  const [filter, setFilter] = React.useState("all");
  const now = new Date();
  const summary = React.useMemo(() => computeMonthlySummary(fees, payments, now), [fees, payments]);

  const rows = React.useMemo(() => clients.map((link) => {
    const fee = fees.find((f) => f.athlete_id === link.athlete_id) || null;
    const list = payments.filter((p) => p.athlete_id === link.athlete_id);
    const fact = paymentFact(fee, list, defaultCurrency, now);
    return { link, fee, list, fact, last: list[0] || null };
  }).sort((a, b) => rank(a.fact.status) - rank(b.fact.status) || a.link.athlete_name.localeCompare(b.link.athlete_name)), [clients, fees, payments, defaultCurrency]);

  const counts = { late: rows.filter((r) => r.fact.status === "overdue").length, due: rows.filter((r) => r.fact.status === "due").length, paid: rows.filter((r) => r.fact.status === "paid").length, none: rows.filter((r) => r.fact.status === "no_fee").length };
  const visible = rows.filter((r) => filter === "all" || (filter === "late" && r.fact.status === "overdue") || (filter === "due" && r.fact.status === "due") || (filter === "paid" && r.fact.status === "paid") || (filter === "none" && r.fact.status === "no_fee"));
  const lateTotal = rows.filter((r) => r.fact.status === "overdue").reduce((s, r) => s + (r.fee?.amount || 0), 0);
  const monthName = now.toLocaleDateString("en-US", { month: "long" });

  return (
    <div className="cx-page">
      <div className="cx-page-head">
        <div>
          <h1 className="cx-h1">{monthName}</h1>
          <div className="cx-sub">You write down what each client paid. Theryn works out who is due and who is late.</div>
        </div>
        <Button variant="primary" icon={<Icon.Plus />} onClick={() => actions.recordPayment(null)}>Record a payment</Button>
      </div>

      <div className="cx-stats">
        <div className="cx-card cx-stat"><span className="k">Received this month</span><span className="v">{fmtMoney(summary.receivedThisMonth, defaultCurrency)}</span></div>
        <div className="cx-card cx-stat"><span className="k">Still expected</span><span className="v">{fmtMoney(summary.outstanding, defaultCurrency)}</span></div>
        <div className="cx-card cx-stat"><span className="k">Late</span><span className="v" style={{ color: lateTotal > 0 ? "var(--cx-red)" : undefined }}>{fmtMoney(lateTotal, defaultCurrency)}</span></div>
      </div>

      <div className="cx-chips cx-mb16" role="group" aria-label="Filter payments">
        <Chip active={filter === "all"} onClick={() => setFilter("all")}>Everyone</Chip>
        <Chip active={filter === "late"} onClick={() => setFilter("late")}>{counts.late} late</Chip>
        <Chip active={filter === "due"} onClick={() => setFilter("due")}>{counts.due} due soon</Chip>
        <Chip active={filter === "paid"} onClick={() => setFilter("paid")}>{counts.paid} paid</Chip>
        {counts.none > 0 && <Chip active={filter === "none"} onClick={() => setFilter("none")}>{counts.none} no fee</Chip>}
      </div>

      {clients.length === 0 ? <Empty title="No clients yet">Payments appear once you have clients.</Empty>
        : visible.length === 0 ? <Empty title="Nothing here">No clients match this filter.</Empty>
        : vp !== "laptop" ? (
          <div className="cx-cardgrid">
            {visible.map((r) => (
              <div key={r.link.id} className="cx-card cx-card-pad cx-col">
                <div className="cx-row">
                  <Avatar name={r.link.athlete_name} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 16, fontWeight: 600 }}>{r.link.athlete_name}</div>
                    <div className="cx-small">{r.fee ? <><span className="cx-muted">{fmtMoney(r.fee.amount, r.fee.currency)} {r.fee.cadence} · </span><Tone tone={r.fact.tone}>{r.fact.label}</Tone></> : <Tone tone="muted">No fee set</Tone>}</div>
                  </div>
                </div>
                <div className="cx-actions-2">
                  {r.fact.status === "overdue" ? <Button onClick={() => actions.remind(r.link.athlete_id)}>Remind</Button> : <Button onClick={() => actions.editFee(r.link.athlete_id)}>{r.fee ? "Change fee" : "Set fee"}</Button>}
                  <Button variant={r.fact.status === "paid" ? undefined : "primary"} onClick={() => actions.recordPayment(r.link.athlete_id)}>{r.fact.status === "paid" ? "Add payment" : "Mark paid"}</Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="cx-card cx-scroll-x">
            <div className="cx-payhead" aria-hidden="true"><div>Client</div><div>Pays</div><div>Amount</div><div>Status</div><div>Last payment</div><div /></div>
            {visible.map((r) => (
              <div key={r.link.id} className="cx-payrow">
                <div className="cx-row"><Avatar name={r.link.athlete_name} size="sm" /><span style={{ fontSize: 15, fontWeight: 600 }}>{r.link.athlete_name}</span></div>
                <div className="cx-small cx-muted" style={{ textTransform: "capitalize" }}>{r.fee?.cadence || "—"}</div>
                <div>{r.fee ? fmtMoney(r.fee.amount, r.fee.currency) : "—"}</div>
                <div><Tone tone={r.fact.tone}>{r.fact.label}</Tone></div>
                <div className="cx-small cx-muted">{r.last ? `${shortDate(r.last.received_date)} · ${fmtMoney(r.last.amount, r.last.currency)}${r.last.notes ? ` · ${r.last.notes}` : ""}` : "None yet"}</div>
                <div className="acts">
                  {r.fact.status === "overdue" && <Button size="sm" onClick={() => actions.remind(r.link.athlete_id)}>Remind</Button>}
                  <Button size="sm" onClick={() => actions.editFee(r.link.athlete_id)}>{r.fee ? "Fee" : "Set fee"}</Button>
                  <Button size="sm" variant={r.fact.status === "paid" ? "soft" : "primary"} onClick={() => actions.recordPayment(r.link.athlete_id)}>{r.fact.status === "paid" ? "Add payment" : "Mark paid"}</Button>
                </div>
              </div>
            ))}
          </div>
        )}
    </div>
  );
}

function rank(status) { return { overdue: 0, due: 1, no_fee: 2, paid: 3 }[status] ?? 4; }

// ── Record payment sheet ──────────────────────────────────────────────────
export function RecordPaymentSheet({ open, onClose, clients, fees, defaultCurrency, presetAthleteId, onSave }) {
  const toast = useToast();
  const [athleteId, setAthleteId] = React.useState(presetAthleteId || "");
  const [amount, setAmount] = React.useState("");
  const [currency, setCurrency] = React.useState(defaultCurrency);
  const [date, setDate] = React.useState(isoDate());
  const [notes, setNotes] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    const id = presetAthleteId || clients[0]?.athlete_id || "";
    setAthleteId(id);
    const fee = fees.find((f) => f.athlete_id === id);
    setAmount(fee ? String(fee.amount) : "");
    setCurrency(fee?.currency || defaultCurrency);
    setDate(isoDate()); setNotes("");
  }, [open, presetAthleteId]);

  React.useEffect(() => {
    if (!open) return;
    const fee = fees.find((f) => f.athlete_id === athleteId);
    if (fee) { setAmount(String(fee.amount)); setCurrency(fee.currency); }
  }, [athleteId]);

  async function save() {
    const n = Number(amount);
    if (!athleteId) { toast("Pick a client", "error"); return; }
    if (!Number.isFinite(n) || n <= 0) { toast("Enter an amount greater than zero", "error"); return; }
    setBusy(true);
    try { await onSave({ athleteId, amount: n, currency, received_date: date, notes: notes.trim() || null }); onClose(); }
    catch (e) { toast(`Could not save: ${e.message}`, "error"); }
    finally { setBusy(false); }
  }
  const client = clients.find((c) => c.athlete_id === athleteId);
  return (
    <Sheet open={open} onClose={onClose} title="Record a payment" subtitle={client ? `Money you received from ${client.athlete_name}.` : "Money you received from a client."}>
      <div className="cx-form">
        <Field label="Client">
          <select className="cx-select" value={athleteId} onChange={(e) => setAthleteId(e.target.value)}>
            {clients.map((c) => <option key={c.athlete_id} value={c.athlete_id}>{c.athlete_name}</option>)}
          </select>
        </Field>
        <div className="cx-form-row">
          <Field label="Amount"><input className="cx-input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))} placeholder="0" /></Field>
          <Field label="Currency"><select className="cx-select" value={currency} onChange={(e) => setCurrency(e.target.value)}>{SUPPORTED_CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.symbol} {c.code}</option>)}</select></Field>
        </div>
        <div className="cx-form-row">
          <Field label="Date received"><input className="cx-input" type="date" value={date} max={isoDate()} onChange={(e) => setDate(e.target.value)} /></Field>
          <Field label="How (optional)"><input className="cx-input" value={notes} onChange={(e) => setNotes(e.target.value.slice(0, 80))} placeholder="cash, bank transfer…" /></Field>
        </div>
        <div className="cx-actions-2"><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={save} disabled={busy}>{busy ? "Saving…" : "Save payment"}</Button></div>
      </div>
    </Sheet>
  );
}

// ── Fee sheet ─────────────────────────────────────────────────────────────
export function FeeSheet({ open, onClose, client, fee, defaultCurrency, onSave, onDelete }) {
  const toast = useToast();
  const [amount, setAmount] = React.useState("");
  const [currency, setCurrency] = React.useState(defaultCurrency);
  const [cadence, setCadence] = React.useState("monthly");
  const [start, setStart] = React.useState(isoDate());
  const [active, setActive] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => {
    if (!open) return;
    setAmount(fee ? String(fee.amount) : ""); setCurrency(fee?.currency || defaultCurrency); setCadence(fee?.cadence || "monthly"); setStart(fee?.start_date || isoDate()); setActive(fee ? fee.active : true);
  }, [open, fee]);
  async function save() {
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) { toast("Enter an amount greater than zero", "error"); return; }
    setBusy(true);
    try { await onSave({ amount: n, currency, cadence, start_date: start, active }); onClose(); }
    catch (e) { toast(`Could not save: ${e.message}`, "error"); }
    finally { setBusy(false); }
  }
  return (
    <Sheet open={open} onClose={onClose} title={fee ? "Change fee" : "Set a fee"} subtitle={client ? `What ${client.athlete_name} pays you, and how often. Theryn uses this to tell you who is due.` : ""}>
      <div className="cx-form">
        <div className="cx-form-row">
          <Field label="Amount"><input className="cx-input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))} placeholder="0" /></Field>
          <Field label="Currency"><select className="cx-select" value={currency} onChange={(e) => setCurrency(e.target.value)}>{SUPPORTED_CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.symbol} {c.code}</option>)}</select></Field>
        </div>
        <div className="cx-form-row">
          <Field label="How often"><select className="cx-select" value={cadence} onChange={(e) => setCadence(e.target.value)}><option value="weekly">Every week</option><option value="monthly">Every month</option><option value="quarterly">Every 3 months</option><option value="yearly">Every year</option></select></Field>
          <Field label="First payment date"><input className="cx-input" type="date" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
        </div>
        <Checkbox checked={active} onChange={setActive}>Fee is active (untick to pause reminders)</Checkbox>
        <div className="cx-actions-2"><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={save} disabled={busy}>{busy ? "Saving…" : "Save fee"}</Button></div>
        {fee && onDelete && <Button variant="danger" onClick={async () => { setBusy(true); try { await onDelete(); onClose(); } finally { setBusy(false); } }} disabled={busy}>Remove fee</Button>}
      </div>
    </Sheet>
  );
}
