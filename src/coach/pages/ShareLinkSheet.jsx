import React from "react";
import { Sheet, Button, Icon, Checkbox, Confirm, useToast } from "../ui/primitives.jsx";
import { useCoachData } from "../data/CoachDataContext.jsx";
import { MEASUREMENT_FIELDS, MEASUREMENT_GROUPS, ALL_FIELD_IDS, DEFAULT_FIELD_IDS, linkUrl, shareMessage, whatsappUrl, askedFields } from "../lib/clientLinks.js";

/**
 * "Share link" on a client page. One durable link per client; the coach
 * can copy it, send it on WhatsApp, share via the system sheet, pick which
 * measurements to ask for, make a new link, or turn it off.
 */
export default function ShareLinkSheet({ open, onClose, client }) {
  const data = useCoachData();
  const toast = useToast();
  const [state, setState] = React.useState({ loading: true, link: null, token: null, error: null });
  const [requested, setRequested] = React.useState(DEFAULT_FIELD_IDS);
  const [busy, setBusy] = React.useState(false);
  const [confirm, setConfirm] = React.useState(null); // "rotate" | "off"
  const first = (client?.athlete_name || "").split(" ")[0];

  React.useEffect(() => {
    if (!open || !client) return;
    let cancelled = false;
    setState({ loading: true, link: null, token: null, error: null });
    setRequested(DEFAULT_FIELD_IDS); // each client starts from the usual five; never carry another client's choice over
    data.getClientLink(client.athlete_id)
      .then((r) => { if (cancelled) return; setState({ loading: false, link: r?.link || null, token: r?.token || null, error: null }); setRequested(r?.link ? askedFields(r.link.requested) : DEFAULT_FIELD_IDS); })
      .catch((e) => { if (!cancelled) setState({ loading: false, link: null, token: null, error: e.message }); });
    return () => { cancelled = true; };
  }, [open, client?.athlete_id]); // eslint-disable-line react-hooks/exhaustive-deps

  const url = state.token ? linkUrl(state.token) : null;
  const text = url ? shareMessage(first, url) : "";

  async function create(rotate = false) {
    setBusy(true);
    try {
      const r = await data.createClientLink(client.athlete_id, { requested });
      setState({ loading: false, link: r.link, token: r.token, error: null });
      toast(rotate ? "New link made. The old one no longer works." : "Link ready");
    } catch (e) { toast(e.message || "Could not make a link", "error"); }
    finally { setBusy(false); setConfirm(null); }
  }
  async function turnOff() {
    setBusy(true);
    try { await data.revokeClientLink(client.athlete_id); setState({ loading: false, link: null, token: null, error: null }); setRequested(DEFAULT_FIELD_IDS); toast("Link turned off"); }
    catch (e) { toast(e.message || "Could not turn off", "error"); }
    finally { setBusy(false); setConfirm(null); }
  }
  async function saveRequested(next) {
    setRequested(next);
    if (!state.link) return;
    // The link on the client's phone reads this every time it opens: no new link needed.
    try { await data.updateClientLinkRequested(client.athlete_id, next); toast(`Saved. ${first} sees it next time they open the link.`); } catch (e) { toast(e.message || "Could not save", "error"); }
  }
  async function copy() {
    try { await navigator.clipboard.writeText(url); toast("Link copied"); }
    catch { toast("Could not copy. Use Share instead.", "error"); }
  }
  async function copyCode() {
    try { await navigator.clipboard.writeText(state.link.connect_code); toast("Code copied"); }
    catch { toast("Could not copy the code", "error"); }
  }
  async function newCode() {
    if (typeof data.resetConnectCode !== "function") return;
    setBusy(true);
    try {
      const code = await data.resetConnectCode(client.athlete_id);
      setState((s) => ({ ...s, link: { ...s.link, connect_code: code, connect_tries: 0 } }));
      toast("New code. The old one stopped working.");
    } catch (e) { toast(e.message || "Could not make a new code", "error"); }
    finally { setBusy(false); }
  }
  async function share() {
    try {
      if (data.isNative) { const { Share } = await import("@capacitor/share"); await Share.share({ text }); }
      else if (navigator.share) await navigator.share({ text });
      else { await navigator.clipboard.writeText(text); toast("Message copied"); }
    } catch {}
  }
  const toggle = (id) => {
    const next = ALL_FIELD_IDS.filter((x) => (x === id ? !requested.includes(id) : requested.includes(x)));
    saveRequested(next);
  };

  return (
    <Sheet open={open} onClose={onClose} title={`${first}'s link`} subtitle={`One link ${first} keeps. It opens today's workout to tick off, and a Measurements tab. No app needed.`}>
      {state.loading ? (
        <div className="cx-spinner" style={{ margin: "24px auto" }} />
      ) : state.error ? (
        <div className="cx-empty"><b>Links need a one-time database update</b>{state.error}</div>
      ) : !url && state.link ? (
        // The link is live but was made on a device that never synced it. Never
        // replace it without saying so: the client may have it pinned in WhatsApp.
        <div className="cx-form">
          <div className="cx-card cx-card-pad" style={{ fontSize: 14, color: "var(--cx-tx2)", lineHeight: 1.5 }}>
            <b style={{ color: "var(--cx-tx)" }}>{first}'s link is working.</b>{" "}
            {state.link.opens ? `Opened ${state.link.opens} time${state.link.opens === 1 ? "" : "s"}` : "Not opened yet"}
            {state.link.submissions ? ` · ${state.link.submissions} sent` : ""}.
            <br />It was made on another phone or computer. Open Theryn there once and the link shows up here too.
          </div>
          <Button onClick={() => setConfirm("rotate")} disabled={busy} icon={<Icon.Link />}>Make a new link instead</Button>
          <div className="cx-small cx-muted">A new link stops the one {first} has now. You'd need to send the new one.</div>
        </div>
      ) : !url ? (
        <div className="cx-form">
          <div className="cx-small cx-muted">{first} doesn't have a link yet. Making one takes a second, then you can send it.</div>
          <Button variant="primary" icon={<Icon.Link />} onClick={() => create(false)} disabled={busy}>{busy ? "Making…" : "Make a link"}</Button>
        </div>
      ) : (
        <div className="cx-form">
          <div className="cx-row" style={{ minHeight: 48, borderRadius: 10, border: "1px solid var(--cx-bd2)", background: "var(--cx-bg)", padding: "6px 6px 6px 12px", gap: 10 }}>
            <span style={{ flex: 1, minWidth: 0, fontSize: 14, lineHeight: 1.35, color: "var(--cx-tx2)", overflowWrap: "anywhere" }}>{url.replace(/^https?:\/\//, "")}</span>
            <Button size="sm" variant="soft" onClick={copy} style={{ color: "var(--cx-a)" }}>Copy</Button>
          </div>
          <div className="cx-actions-2">
            <Button variant="primary" icon={<Icon.Messages size={18} />} onClick={() => window.open(whatsappUrl(text), "_blank", "noopener")}>WhatsApp</Button>
            <Button icon={<Icon.Share size={18} />} onClick={share}>Share…</Button>
          </div>
          <div className="cx-card cx-card-pad" style={{ fontSize: 13, color: "var(--cx-tx2)", lineHeight: 1.45 }}>
            <span className="cx-muted">Message that goes with it</span><br />{text.replace(url, "").trim()}
          </div>

          {/* The second half of getting in: the link opens today, the code opens
              the rest. Kept out of the message on purpose. */}
          <div className="cx-col">
            <div style={{ fontWeight: 700 }}>{state.link?.connected_at ? "Connected" : "Connect code"}</div>
            {state.link?.connected_at ? (
              <>
                <div className="cx-small cx-muted">{state.link.connected_name || "They"} connected an account on {new Date(state.link.connected_at).toLocaleDateString("en-US", { day: "numeric", month: "long" })}. {first} can open every day of the plan and add their own sessions.{state.link.connected_email ? ` (${state.link.connected_email})` : ""}</div>
              </>
            ) : (
              <>
                <div className="cx-small cx-muted">Send this to {first} separately — a message, or read it out. With it they can open every day of the plan and add their own sessions. The link alone still only opens today.</div>
                <div className="cx-row" style={{ minHeight: 48, borderRadius: 10, border: "1px solid var(--cx-bd2)", background: "var(--cx-bg)", padding: "6px 6px 6px 12px", gap: 10 }}>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 20, fontWeight: 800, letterSpacing: "0.22em" }}>{state.link?.connect_code || "—"}</span>
                  {state.link?.connect_code && <Button size="sm" variant="soft" onClick={copyCode} style={{ color: "var(--cx-a)" }}>Copy</Button>}
                </div>
                <button type="button" className="cx-linkbtn cx-small" style={{ alignSelf: "flex-start" }} onClick={newCode} disabled={busy}>New code</button>
              </>
            )}
          </div>

          <div className="cx-col">
            <div style={{ fontWeight: 700 }}>Measurements to ask for</div>
            <div className="cx-small cx-muted">{first} sees these first on their link. Everything is optional, and they can add any of the others too. Body weight is always there.</div>
            {MEASUREMENT_GROUPS.map((g) => (
              <div key={g} className="cx-col" style={{ gap: 2 }}>
                <span className="cx-small cx-muted" style={{ fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", fontSize: 11 }}>{g}</span>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 4 }}>
                  {MEASUREMENT_FIELDS.filter((f) => f.group === g).map((f) => <Checkbox key={f.id} checked={requested.includes(f.id)} onChange={() => toggle(f.id)}>{f.label}{f.unit === "%" ? " %" : ""}</Checkbox>)}
                </div>
              </div>
            ))}
            <div className="cx-small cx-muted">None ticked: {first} sees chest, waist, hips, left arm and left thigh.</div>
          </div>

          <div className="cx-row" style={{ justifyContent: "space-between", paddingTop: 4 }}>
            <div className="cx-small cx-muted" style={{ lineHeight: 1.4 }}>
              {state.link.opens ? `Opened ${state.link.opens} time${state.link.opens === 1 ? "" : "s"}` : "Not opened yet"}
              {state.link.submissions ? ` · ${state.link.submissions} sent` : ""}
              <br />New link stops the old one working.
            </div>
            <div className="cx-row">
              <Button size="sm" onClick={() => setConfirm("rotate")} disabled={busy}>New link</Button>
              <Button size="sm" variant="danger" onClick={() => setConfirm("off")} disabled={busy}>Turn off</Button>
            </div>
          </div>
        </div>
      )}
      <Confirm open={confirm === "rotate"} title="Make a new link?" body={`The link ${first} has now will stop working. You'll need to send the new one.`} confirmLabel="Make new link" busy={busy} onConfirm={() => create(true)} onClose={() => setConfirm(null)} />
      <Confirm open={confirm === "off"} title="Turn off the link?" body={`${first} won't be able to send anything until you make a new one.`} confirmLabel="Turn off" danger busy={busy} onConfirm={turnOff} onClose={() => setConfirm(null)} />
    </Sheet>
  );
}
