import React from "react";
import { Avatar, Button, Icon, Empty, useViewport } from "../ui/primitives.jsx";
import { relativeTime, clockTime, isoDate } from "../lib/format.js";
import { useCoachData } from "../data/CoachDataContext.jsx";

/**
 * Conversation list beside the open chat (tablet and laptop); list then a
 * full-screen chat on phone.
 */
export default function MessagesPage({ clients, previews, refreshPreviews, openAthleteId, onOpen }) {
  const vp = useViewport();
  const [q, setQ] = React.useState("");
  const list = React.useMemo(() => {
    const rows = clients.map((c) => ({ link: c, p: previews[c.athlete_id] || {} }));
    rows.sort((a, b) => (b.p.lastMsgAt || "").localeCompare(a.p.lastMsgAt || "") || a.link.athlete_name.localeCompare(b.link.athlete_name));
    const s = q.trim().toLowerCase();
    return s ? rows.filter((r) => r.link.athlete_name.toLowerCase().includes(s)) : rows;
  }, [clients, previews, q]);
  const open = clients.find((c) => c.athlete_id === openAthleteId) || null;

  if (clients.length === 0) return <div className="cx-page"><Empty title="No clients yet">Messages appear once you have clients.</Empty></div>;

  const convList = (
    <div className="cx-convlist">
      <div style={{ padding: "16px 16px 8px", display: "flex", flexDirection: "column", gap: 10 }}>
        <h1 className="cx-h1">Messages</h1>
        <div className="cx-search" style={{ width: "100%", maxWidth: "none" }}><Icon.Search /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" aria-label="Search conversations" /></div>
      </div>
      {list.map(({ link, p }) => (
        <button key={link.athlete_id} type="button" className={`cx-conv ${p.unread > 0 ? "unread" : ""}`} aria-selected={openAthleteId === link.athlete_id} onClick={() => onOpen(link.athlete_id)}>
          <Avatar name={link.athlete_name} />
          <div className="body">
            <div className="top"><b>{link.athlete_name}</b><time>{relativeTime(p.lastMsgAt)}</time></div>
            <div className="prev">{p.lastMsg || <span className="cx-muted">No messages yet</span>}</div>
          </div>
          {p.unread > 0 && <span className="cx-badge">{p.unread}</span>}
        </button>
      ))}
    </div>
  );

  if (vp === "phone") {
    if (open) return <div className="cx-msgs"><ChatPane client={open} onBack={() => onOpen(null)} onRead={refreshPreviews} /></div>;
    return <div className="cx-msgs">{convList}</div>;
  }
  return (
    <div className="cx-msgs">
      {convList}
      {open ? <ChatPane client={open} onRead={refreshPreviews} /> : <div className="cx-chatpane"><Empty title="Pick a conversation">Choose a client on the left to read and reply.</Empty></div>}
    </div>
  );
}

function ChatPane({ client, onBack, onRead }) {
  const data = useCoachData();
  const useChatImpl = data.useChat;
  const { messages, loading, error, typingUsers, sendMessage, markRead, sendTyping } = useChatImpl({
    authUser: { id: data.coachId, display_name: data.coachName },
    coachId: data.coachId,
    athleteId: client.athlete_id,
    selfName: data.coachName,
  });
  const [text, setText] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const bodyRef = React.useRef(null);
  const incoming = messages.filter((m) => m.sender_id !== data.coachId).length;

  React.useEffect(() => { markRead().then(() => onRead?.()).catch(() => {}); }, [client.athlete_id, incoming]); // eslint-disable-line react-hooks/exhaustive-deps
  React.useEffect(() => { const el = bodyRef.current; if (el) el.scrollTop = el.scrollHeight; }, [messages.length, client.athlete_id]);

  async function send() {
    const t = text.trim();
    if (!t || sending) return;
    setSending(true);
    setText("");
    try { await sendMessage(t); } catch { setText(t); } finally { setSending(false); }
  }

  let lastDay = null;
  const lastOwnIdx = messages.reduce((acc, m, i) => (m.sender_id === data.coachId ? i : acc), -1);
  return (
    <div className="cx-chatpane">
      <div className="cx-chat-head">
        {onBack && <Button size="sm" icon={<Icon.Back />} aria-label="Back to conversations" onClick={onBack} />}
        <Avatar name={client.athlete_name} />
        <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 16, fontWeight: 700 }}>{client.athlete_name}</div>{typingUsers.length > 0 && <div className="cx-small cx-muted">typing…</div>}</div>
      </div>
      <div className="cx-chat-body" ref={bodyRef}>
        {loading && <div className="cx-empty">Loading messages…</div>}
        {error && <div className="cx-empty" style={{ color: "var(--cx-red)" }}>{error}</div>}
        {!loading && !error && messages.length === 0 && <div className="cx-empty">No messages yet. Say hi.</div>}
        {messages.map((m, i) => {
          const day = isoDate(new Date(m.created_at));
          const showDay = day !== lastDay; lastDay = day;
          const mine = m.sender_id === data.coachId;
          return (
            <React.Fragment key={m.client_id || m.id}>
              {showDay && <div className="cx-dateline">{dayLabel(day)}</div>}
              <div className={`cx-bubble ${mine ? "me" : "them"}`} title={clockTime(m.created_at)}>{m.content}</div>
              {mine && i === lastOwnIdx && <div className="cx-bubble-meta">{m.status === "read" ? "Read" : m.status === "sending" ? "Sending…" : "Sent"} · {clockTime(m.created_at)}</div>}
            </React.Fragment>
          );
        })}
      </div>
      <form className="cx-chat-input" onSubmit={(e) => { e.preventDefault(); send(); }}>
        <input value={text} onChange={(e) => { setText(e.target.value); sendTyping?.(); }} placeholder={`Message ${client.athlete_name.split(" ")[0]}`} aria-label="Message" maxLength={4000} />
        <button type="submit" aria-label="Send" disabled={!text.trim() || sending}><Icon.Send /></button>
      </form>
    </div>
  );
}

function dayLabel(iso) {
  const today = isoDate();
  if (iso === today) return "Today";
  const y = new Date(); y.setDate(y.getDate() - 1);
  if (iso === isoDate(y)) return "Yesterday";
  return new Date(iso + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}
