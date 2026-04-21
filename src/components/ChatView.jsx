import React from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { useChat } from "../hooks/useChat";

// Color tokens (mirrors App.jsx)
const A   = "#C8FF00";
const BG  = "#080808";
const S1  = "#101010";
const S2  = "#181818";
const BD  = "#1E1E1E";
const TX  = "#F0F0F0";
const SB  = "#585858";

// ── Helpers ───────────────────────────────────────────────────────────────────

function groupByDate(messages) {
  const groups = [];
  let current = null;
  for (const msg of messages) {
    const day = msg.created_at.slice(0, 10); // "YYYY-MM-DD"
    if (day !== current?.date) {
      current = { date: day, messages: [] };
      groups.push(current);
    }
    current.messages.push(msg);
  }
  return groups;
}

function formatDateLabel(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function isMobileDevice() {
  return /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
}

// ── Sub-components ────────────────────────────────────────────────────────────

function DateSeparator({ date }) {
  return (
    <div style={{
      textAlign: "center",
      color: SB,
      fontSize: "11px",
      letterSpacing: "0.05em",
      textTransform: "uppercase",
      margin: "16px 0 8px",
    }}>
      {formatDateLabel(date)}
    </div>
  );
}

function MessageBubble({ message, isOwn, showReceipt }) {
  const receiptLabel =
    message.status === "sending" ? "Sending\u2026"
    : message.status === "read" ? "Read"
    : "\u2713\u2713";

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      alignItems: isOwn ? "flex-end" : "flex-start",
      marginBottom: "4px",
    }}>
      <div style={{
        maxWidth: "75%",
        background: isOwn ? A : S2,
        color: isOwn ? BG : TX,
        borderRadius: isOwn ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
        padding: "10px 14px",
        fontSize: "15px",
        lineHeight: "1.45",
        wordBreak: "break-word",
        opacity: message.is_optimistic ? 0.65 : 1,
        transition: "opacity 0.2s",
      }}>
        {message.content}
      </div>
      {isOwn && showReceipt && (
        <div style={{
          fontSize: "11px",
          color: SB,
          marginTop: "3px",
          paddingRight: "4px",
        }}>
          {receiptLabel}
        </div>
      )}
      {!isOwn && (
        <div style={{ fontSize: "10px", color: SB, marginTop: "2px", paddingLeft: "4px" }}>
          {formatTime(message.created_at)}
        </div>
      )}
    </div>
  );
}

function TypingIndicator({ users }) {
  if (users.length === 0) return null;
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: "8px",
      padding: "4px 0 8px",
    }}>
      <div style={{ display: "flex", gap: "4px", alignItems: "center" }}>
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: SB,
            }}
            animate={{ y: [0, -5, 0] }}
            transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.15 }}
          />
        ))}
      </div>
      <span style={{ fontSize: "12px", color: SB }}>
        {users[0].name} is typing
      </span>
    </div>
  );
}

function InputBar({ onSend, onTyping }) {
  const [text, setText] = React.useState("");
  const textareaRef = React.useRef(null);

  function handleChange(e) {
    setText(e.target.value);
    onTyping();
    // Auto-resize
    const el = textareaRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = Math.min(el.scrollHeight, 120) + "px";
    }
  }

  function handleSend() {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setText("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  }

  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey && !isMobileDevice()) {
      e.preventDefault();
      handleSend();
    }
  }

  const canSend = text.trim().length > 0;

  return (
    <div style={{
      position: "sticky",
      bottom: 0,
      background: S1,
      borderTop: `1px solid ${BD}`,
      padding: "10px 12px",
      paddingBottom: "max(10px, env(safe-area-inset-bottom, 10px))",
      display: "flex",
      alignItems: "flex-end",
      gap: "10px",
    }}>
      <textarea
        ref={textareaRef}
        value={text}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        rows={1}
        placeholder="Message\u2026"
        style={{
          flex: 1,
          background: S2,
          border: `1px solid ${BD}`,
          borderRadius: "20px",
          padding: "10px 14px",
          color: TX,
          fontSize: "15px",
          resize: "none",
          maxHeight: "120px",
          overflowY: "auto",
          lineHeight: "1.4",
          outline: "none",
          fontFamily: "inherit",
        }}
      />
      <button
        onClick={handleSend}
        disabled={!canSend}
        style={{
          width: "40px",
          height: "40px",
          borderRadius: "50%",
          background: canSend ? A : "#2C2C2C",
          border: "none",
          cursor: canSend ? "pointer" : "default",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          transition: "background 0.15s",
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
          stroke={canSend ? BG : SB} strokeWidth="2.5"
          strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="19" x2="12" y2="5"/>
          <polyline points="5 12 12 5 19 12"/>
        </svg>
      </button>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function ChatView({
  authUser,
  coachId,
  athleteId,
  otherPartyName,
  onClose,
}) {
  const selfName = authUser?.display_name || authUser?.email?.split("@")[0] || "You";

  const { messages, loading, error, typingUsers, sendMessage, markRead, sendTyping } =
    useChat({ authUser, coachId, athleteId, selfName });

  const bottomRef = React.useRef(null);
  const scrollRef = React.useRef(null);
  const prevIncomingCount = React.useRef(0);
  const [atBottom, setAtBottom] = React.useState(true);
  const [newCount, setNewCount] = React.useState(0);

  // Track whether the user is pinned to the bottom of the scroll.
  function handleScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    setAtBottom(near);
    if (near) setNewCount(0);
  }

  // Auto-scroll on new messages only if the user is already at the bottom.
  // Otherwise surface a "jump to latest" pill so we don't yank them mid-read.
  React.useEffect(() => {
    if (messages.length === 0) return;
    const last = messages[messages.length - 1];
    const isOwn = last?.sender_id === authUser?.id;
    if (atBottom || isOwn) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    } else {
      setNewCount((n) => n + 1);
    }
  }, [messages.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // ESC closes the chat.
  React.useEffect(() => {
    function onKey(e) { if (e.key === "Escape") onClose?.(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Mark read on mount
  React.useEffect(() => {
    markRead();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Mark read when new incoming message arrives while chat is open
  React.useEffect(() => {
    const incomingCount = messages.filter((m) => m.sender_id !== authUser?.id).length;
    if (incomingCount > prevIncomingCount.current) {
      markRead();
    }
    prevIncomingCount.current = incomingCount;
  }, [messages, authUser?.id, markRead]);

  // Find index of last own message (for receipt display)
  const lastOwnIdx = messages.reduce((acc, m, i) =>
    m.sender_id === authUser?.id ? i : acc, -1);

  const grouped = groupByDate(messages);

  const initials = otherPartyName
    ? otherPartyName.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()
    : "?";

  // Lock background scroll while chat is open
  React.useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  const overlay = (
    <div style={{
      position: "fixed",
      inset: 0,
      zIndex: 9999,
      background: BG,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
    }}>
    <div style={{
      width: "100%",
      maxWidth: "820px",
      height: "100%",
      display: "flex",
      flexDirection: "column",
      minHeight: 0,
    }}>
      {/* Header */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: "12px",
        padding: "16px 16px",
        borderBottom: `1px solid ${BD}`,
        background: BG,
        position: "sticky",
        top: 0,
        zIndex: 5,
        paddingTop: "max(16px, env(safe-area-inset-top, 16px))",
      }}>
        <button
          onClick={onClose}
          style={{
            background: "none",
            border: "none",
            color: TX,
            fontSize: "22px",
            cursor: "pointer",
            padding: "4px",
            lineHeight: 1,
            display: "flex",
            alignItems: "center",
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
            stroke={TX} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
        </button>
        <div style={{
          width: 36, height: 36, borderRadius: "50%",
          background: A, display: "flex", alignItems: "center",
          justifyContent: "center", fontSize: "13px",
          fontWeight: 800, color: BG, flexShrink: 0,
        }}>
          {initials}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: "16px", fontWeight: 700, color: TX }}>
            {otherPartyName}
          </div>
        </div>
      </div>

      {/* Message list */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "12px 16px",
          display: "flex",
          flexDirection: "column",
          position: "relative",
        }}
      >
        {loading && (
          <div style={{ textAlign: "center", color: SB, padding: "48px 0", fontSize: "14px" }}>
            Loading messages\u2026
          </div>
        )}
        {error && (
          <div style={{ textAlign: "center", color: "#FF5C5C", padding: "16px 0", fontSize: "14px" }}>
            {error}
          </div>
        )}
        {!loading && !error && messages.length === 0 && (
          <div style={{ textAlign: "center", color: SB, padding: "48px 0", fontSize: "14px" }}>
            No messages yet. Say hi!
          </div>
        )}

        {grouped.map(({ date, messages: group }) => (
          <React.Fragment key={date}>
            <DateSeparator date={date} />
            {group.map((msg) => {
              const absoluteIdx = messages.indexOf(msg);
              return (
                <MessageBubble
                  key={msg.client_id || msg.id}
                  message={msg}
                  isOwn={msg.sender_id === authUser?.id}
                  showReceipt={absoluteIdx === lastOwnIdx}
                />
              );
            })}
          </React.Fragment>
        ))}

        <TypingIndicator users={typingUsers} />
        <div ref={bottomRef} />
      </div>

      {!atBottom && newCount > 0 && (
        <button
          onClick={() => bottomRef.current?.scrollIntoView({ behavior: "smooth" })}
          style={{
            position: "absolute",
            bottom: "84px",
            left: "50%",
            transform: "translateX(-50%)",
            background: A,
            color: BG,
            border: "none",
            borderRadius: "18px",
            padding: "6px 14px",
            fontSize: "12px",
            fontWeight: 700,
            cursor: "pointer",
            boxShadow: "0 4px 14px rgba(0,0,0,0.35)",
            zIndex: 6,
          }}
        >
          {newCount} new message{newCount > 1 ? "s" : ""} ↓
        </button>
      )}

      <InputBar onSend={sendMessage} onTyping={sendTyping} />
    </div>
    </div>
  );

  return createPortal(overlay, document.body);
}
