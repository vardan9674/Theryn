import React from "react";
import { Sheet, Button, Icon, Field, Avatar, Confirm, useToast } from "../ui/primitives.jsx";
import { useCoachData } from "../data/CoachDataContext.jsx";
import { SUPPORTED_CURRENCIES } from "../../hooks/usePayments.ts";

// ── Add a client: show my code, or enter theirs ───────────────────────────
export function AddClientSheet({ open, onClose, onAdded }) {
  const data = useCoachData();
  const toast = useToast();
  const [myCode, setMyCode] = React.useState(null);
  const [code, setCode] = React.useState("");
  const [first, setFirst] = React.useState("");
  const [last, setLast] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => { if (open) { setCode(""); setFirst(""); setLast(""); data.ensureInviteCode().then(setMyCode).catch(() => setMyCode("")); } }, [open, data]);

  async function addByName() {
    if (!first.trim()) { toast("A first name is needed.", "error"); return; }
    setBusy(true);
    try {
      const c = await data.createManualClient({ firstName: first, lastName: last });
      toast(`${c.athlete_name} added. Build their plan when you're ready.`);
      onAdded?.(c);
      onClose();
    } catch (e) { toast(e.message || "Could not add", "error"); }
    finally { setBusy(false); }
  }

  async function copy() {
    try { await navigator.clipboard.writeText(myCode); toast("Code copied"); }
    catch { toast("Could not copy. Read it out instead.", "error"); }
  }
  async function share() {
    const text = `Join me on Theryn. Install the app, pick Athlete, then enter my coach code: ${myCode}`;
    try {
      if (data.isNative) { const { Share } = await import("@capacitor/share"); await Share.share({ text }); }
      else if (navigator.share) await navigator.share({ text });
      else { await navigator.clipboard.writeText(text); toast("Invitation copied"); }
    } catch {}
  }
  async function add() {
    if (!code.trim()) return;
    setBusy(true);
    try { const p = await data.addClientByCode(code.trim()); toast(`${p.display_name || "Client"} added`); onAdded?.(); onClose(); }
    catch (e) { toast(e.message || "Could not add", "error"); }
    finally { setBusy(false); }
  }
  return (
    <Sheet open={open} onClose={onClose} title="Add a client" subtitle="Three ways. Any of them works.">
      <div className="cx-form">
        <div className="cx-card cx-card-pad cx-col" style={{ borderColor: "rgba(200,255,0,0.35)" }}>
          <div style={{ fontWeight: 700 }}>Add by name</div>
          <div className="cx-small cx-muted">For someone who isn't on the app. You can build their plan, export it to Excel, and track payments. Connect them to an account later if they join.</div>
          <div className="cx-form-row">
            <input className="cx-input" value={first} onChange={(e) => setFirst(e.target.value.slice(0, 60))} placeholder="First name" aria-label="First name" autoComplete="off" />
            <input className="cx-input" value={last} onChange={(e) => setLast(e.target.value.slice(0, 60))} onKeyDown={(e) => e.key === "Enter" && addByName()} placeholder="Last name" aria-label="Last name" autoComplete="off" />
          </div>
          <Button variant="primary" icon={<Icon.Person />} onClick={addByName} disabled={!first.trim() || busy}>{busy ? "Adding…" : "Add client"}</Button>
        </div>
        <div className="cx-small cx-muted" style={{ textAlign: "center" }}>Or, if they have the app</div>
        <div className="cx-card cx-card-pad cx-col">
          <div style={{ fontWeight: 700 }}>Give them your code</div>
          <div className="cx-small cx-muted">They install Theryn, pick Athlete, and enter this code.</div>
          <div className="cx-row" style={{ justifyContent: "space-between" }}>
            <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: 2, fontVariantNumeric: "tabular-nums" }}>{myCode == null ? "…" : myCode || "—"}</div>
            <div className="cx-row"><Button size="sm" icon={<Icon.Copy />} onClick={copy} disabled={!myCode}>Copy</Button><Button size="sm" icon={<Icon.Share />} onClick={share} disabled={!myCode}>Share</Button></div>
          </div>
        </div>
        <div className="cx-card cx-card-pad cx-col">
          <div style={{ fontWeight: 700 }}>Enter their code</div>
          <div className="cx-small cx-muted">Ask them for the code shown in their app under Coach.</div>
          <div className="cx-row">
            <input className="cx-input" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} onKeyDown={(e) => e.key === "Enter" && add()} placeholder="Their code" aria-label="Client code" style={{ textTransform: "uppercase", letterSpacing: 1 }} />
            <Button variant="primary" onClick={add} disabled={!code.trim() || busy}>{busy ? "Adding…" : "Add"}</Button>
          </div>
        </div>
      </div>
    </Sheet>
  );
}

// ── Connect a name-only client to a real account ──────────────────────────
export function LinkClientSheet({ open, onClose, client, candidates, onLinked }) {
  const data = useCoachData();
  const toast = useToast();
  const [pick, setPick] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => { if (open) setPick(candidates[0]?.athlete_id || ""); }, [open, candidates]);
  const target = candidates.find((c) => c.athlete_id === pick);
  const first = (client?.athlete_name || "").split(" ")[0];

  async function link() {
    if (!target) return;
    setBusy(true);
    try {
      const res = await data.linkManualClient(client.athlete_id, target.athlete_id);
      const bits = [res?.moved?.plan && "plan", res?.moved?.fee && "fee", res?.moved?.payments ? `${res.moved.payments} payment${res.moved.payments === 1 ? "" : "s"}` : null].filter(Boolean);
      toast(bits.length ? `Connected. Moved ${bits.join(", ")} to ${target.athlete_name}.` : `Connected to ${target.athlete_name}.`);
      onLinked?.(target.athlete_id);
      onClose();
    } catch (e) { toast(e.message || "Could not connect", "error"); }
    finally { setBusy(false); }
  }

  return (
    <Sheet open={open} onClose={onClose} title={`Connect ${first} to an account`} subtitle="When someone you added by name joins the app with your code, pick their account here. Their plan, fee, and payments move over and the name-only entry is removed.">
      {candidates.length === 0 ? (
        <div className="cx-empty" style={{ padding: "24px 0" }}><b>No app accounts to connect yet</b>Share your code with {first}. Once they join, they appear here.</div>
      ) : (
        <div className="cx-form">
          <Field label="Their account">
            <select className="cx-select" value={pick} onChange={(e) => setPick(e.target.value)}>
              {candidates.map((c) => <option key={c.athlete_id} value={c.athlete_id}>{c.athlete_name}</option>)}
            </select>
          </Field>
          <div className="cx-small cx-muted">If {target?.athlete_name || "they"} already has a plan, {first}'s plan replaces it.</div>
          <div className="cx-actions-2"><Button onClick={onClose}>Cancel</Button><Button variant="primary" icon={<Icon.Link />} onClick={link} disabled={!target || busy}>{busy ? "Connecting…" : "Connect"}</Button></div>
        </div>
      )}
    </Sheet>
  );
}

// ── Profile & account ─────────────────────────────────────────────────────
export function ProfileSheet({ open, onClose, clients, onRemoveClient }) {
  const data = useCoachData();
  const toast = useToast();
  const [name, setName] = React.useState(data.coachName);
  const [editing, setEditing] = React.useState(false);
  const [currency, setCurrency] = React.useState(data.defaultCurrency);
  const [busy, setBusy] = React.useState(false);
  const [removing, setRemoving] = React.useState(null);
  React.useEffect(() => { if (open) { setName(data.coachName); setCurrency(data.defaultCurrency); setEditing(false); } }, [open, data.coachName, data.defaultCurrency]);

  async function saveName() {
    const n = name.trim();
    if (!n) return;
    setBusy(true);
    try { await data.updateDisplayName(n); setEditing(false); toast("Name saved"); }
    catch (e) { toast(e.message || "Could not save", "error"); }
    finally { setBusy(false); }
  }
  async function changeCurrency(code) {
    setCurrency(code);
    try { await data.updateCurrency(code); toast(`Currency set to ${code}`); }
    catch (e) { toast(e.message || "Could not save", "error"); }
  }
  async function confirmRemove() {
    setBusy(true);
    try { await data.removeClient(removing.id); toast(`${removing.athlete_name} removed`); setRemoving(null); onRemoveClient?.(); }
    catch (e) { toast(e.message || "Could not remove", "error"); }
    finally { setBusy(false); }
  }

  return (
    <Sheet open={open} onClose={onClose} title="You">
      <div className="cx-form">
        <div className="cx-row">
          <Avatar name={data.coachName} size="lg" />
          <div style={{ flex: 1, minWidth: 0 }}>
            {editing ? (
              <div className="cx-row"><input className="cx-input" value={name} onChange={(e) => setName(e.target.value)} autoFocus aria-label="Your name" /><Button variant="primary" size="sm" onClick={saveName} disabled={busy || !name.trim()}>Save</Button></div>
            ) : (
              <>
                <div className="cx-row"><div style={{ fontSize: 17, fontWeight: 700 }} className="cx-ellipsis">{data.coachName}</div><Button size="sm" onClick={() => setEditing(true)}>Edit</Button></div>
                <div className="cx-small cx-muted cx-ellipsis">{data.coachEmail}</div>
              </>
            )}
          </div>
        </div>

        <Field label="Currency for fees and payments">
          <select className="cx-select" value={currency} onChange={(e) => changeCurrency(e.target.value)}>
            {SUPPORTED_CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.symbol} {c.code} · {c.label}</option>)}
          </select>
        </Field>

        {clients.length > 0 && (
          <div className="cx-card">
            <div className="cx-card-pad" style={{ borderBottom: "1px solid var(--cx-bd)", fontSize: 13, fontWeight: 600 }}>Your clients</div>
            {clients.map((c) => (
              <div key={c.id} className="cx-row cx-card-pad" style={{ justifyContent: "space-between", borderBottom: "1px solid var(--cx-bd)", paddingTop: 8, paddingBottom: 8 }}>
                <span className="cx-row"><Avatar name={c.athlete_name} size="sm" />{c.athlete_name}{c.manual && <span className="cx-tag">Not on app</span>}</span>
                <Button size="sm" variant="danger" onClick={() => setRemoving(c)}>Remove</Button>
              </div>
            ))}
          </div>
        )}

        <div className="cx-actions-2">
          <Button onClick={() => { onClose(); data.switchRole(); }}>Switch to Athlete</Button>
          <Button variant="danger" onClick={() => { onClose(); data.signOut(); }}>Sign out</Button>
        </div>
      </div>
      <Confirm open={Boolean(removing)} title={`Remove ${removing?.athlete_name}?`} body="They keep their app and data. You stop seeing them here and can't message them until you connect again." confirmLabel="Remove" danger busy={busy} onConfirm={confirmRemove} onClose={() => setRemoving(null)} />
    </Sheet>
  );
}
