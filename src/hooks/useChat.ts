import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { enqueueMessage, processOfflineQueue } from "../lib/offlineQueue";

export type MessageStatus = "sending" | "sent" | "read";

export interface ChatMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  client_id: string;
  created_at: string;
  status: MessageStatus;
  is_optimistic?: boolean;
}

export interface UseChatReturn {
  messages: ChatMessage[];
  loading: boolean;
  error: string | null;
  typingUsers: { user_id: string; name: string }[];
  conversationId: string | null;
  sendMessage: (content: string) => Promise<void>;
  markRead: () => Promise<void>;
  sendTyping: () => void;
}

export function useChat(params: {
  authUser: { id: string } | null;
  coachId: string | null;
  athleteId: string | null;
  selfName: string;
}): UseChatReturn {
  const { authUser, coachId, athleteId, selfName } = params;

  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [typingUsers, setTypingUsers] = useState<{ user_id: string; name: string }[]>([]);

  const typingChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const sendTypingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingClearTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // ── Resolve conversation ────────────────────────────────────────────────────
  useEffect(() => {
    if (!authUser?.id || !coachId || !athleteId) {
      setLoading(false);
      return;
    }

    async function resolve() {
      setLoading(true);
      setError(null);

      const { data, error: fetchErr } = await supabase
        .from("conversations")
        .select("id")
        .eq("coach_id", coachId)
        .eq("athlete_id", athleteId)
        .maybeSingle();

      if (fetchErr) {
        setError("Could not load conversation.");
        setLoading(false);
        return;
      }

      if (data) {
        setConversationId(data.id);
        return;
      }

      // Trigger may not have fired yet — create it directly
      const { data: created, error: insertErr } = await supabase
        .from("conversations")
        .insert({ coach_id: coachId, athlete_id: athleteId })
        .select("id")
        .single();

      if (insertErr?.code === "23505") {
        // Lost race — fetch again
        const { data: retry } = await supabase
          .from("conversations")
          .select("id")
          .eq("coach_id", coachId)
          .eq("athlete_id", athleteId)
          .single();
        setConversationId(retry?.id ?? null);
      } else if (insertErr) {
        setError("Could not start conversation.");
        setLoading(false);
      } else {
        setConversationId(created?.id ?? null);
      }
    }

    resolve();
  }, [authUser?.id, coachId, athleteId]);

  // ── Load initial messages once conversationId is known ───────────────────
  useEffect(() => {
    if (!conversationId || !authUser?.id) return;

    async function loadMessages() {
      // Fetch last 50 messages
      const { data: msgs, error: msgsErr } = await supabase
        .from("messages")
        .select("id, conversation_id, sender_id, content, client_id, created_at")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true })
        .limit(50);

      if (msgsErr) {
        setError("Could not load messages.");
        setLoading(false);
        return;
      }

      // Fetch read receipts to compute initial status
      const { data: reads } = await supabase
        .from("conversation_reads")
        .select("user_id, last_read_at")
        .eq("conversation_id", conversationId);

      const readMap: Record<string, string> = {};
      for (const r of reads ?? []) {
        readMap[r.user_id] = r.last_read_at;
      }

      const otherId = authUser!.id === coachId ? athleteId : coachId;
      const otherLastRead = otherId ? (readMap[otherId] ?? null) : null;

      const mapped: ChatMessage[] = (msgs ?? []).map((m) => ({
        ...m,
        status: computeStatus(m, authUser!.id, otherLastRead),
      }));

      setMessages(mapped);
      setLoading(false);
    }

    loadMessages();
  }, [conversationId, authUser?.id]);

  // ── Realtime subscriptions ────────────────────────────────────────────────
  useEffect(() => {
    if (!conversationId || !authUser?.id) return;

    // ① New messages
    const msgChannel = supabase
      .channel(`messages:${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const incoming = payload.new as ChatMessage;
          setMessages((prev) => {
            // Replace optimistic copy matched by client_id
            const idx = prev.findIndex(
              (m) => m.client_id === incoming.client_id && m.is_optimistic
            );
            if (idx !== -1) {
              const updated = [...prev];
              updated[idx] = { ...incoming, status: "sent", is_optimistic: false };
              return updated;
            }
            // Incoming from the other party
            return [...prev, { ...incoming, status: "sent", is_optimistic: false }];
          });
        }
      )
      .subscribe();

    // ② Read receipt changes
    const readsChannel = supabase
      .channel(`reads:${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "conversation_reads",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const row = payload.new as { user_id: string; last_read_at: string };
          if (!row || row.user_id === authUser!.id) return;
          setMessages((prev) =>
            prev.map((m) =>
              m.sender_id === authUser!.id &&
              m.status === "sent" &&
              m.created_at <= row.last_read_at
                ? { ...m, status: "read" }
                : m
            )
          );
        }
      )
      .subscribe();

    // ③ Typing indicators via Broadcast (no DB write)
    const typingChannel = supabase.channel(`typing:${conversationId}`, {
      config: { broadcast: { self: false } },
    });
    typingChannel
      .on("broadcast", { event: "typing" }, (payload) => {
        const { user_id, name } = payload.payload as { user_id: string; name: string };
        setTypingUsers((prev) => {
          const filtered = prev.filter((u) => u.user_id !== user_id);
          return [...filtered, { user_id, name }];
        });
        // Auto-clear after 3s (sender broadcasts every ~2s while typing)
        if (typingClearTimers.current[user_id]) {
          clearTimeout(typingClearTimers.current[user_id]);
        }
        typingClearTimers.current[user_id] = setTimeout(() => {
          setTypingUsers((prev) => prev.filter((u) => u.user_id !== user_id));
        }, 3000);
      })
      .subscribe();

    typingChannelRef.current = typingChannel;

    return () => {
      supabase.removeChannel(msgChannel);
      supabase.removeChannel(readsChannel);
      supabase.removeChannel(typingChannel);
      typingChannelRef.current = null;
    };
  }, [conversationId, authUser?.id]);

  // ── sendMessage ───────────────────────────────────────────────────────────
  const sendMessage = useCallback(
    async (content: string) => {
      if (!conversationId || !authUser?.id || !content.trim()) return;

      const clientId = crypto.randomUUID();
      const now = new Date().toISOString();
      const trimmed = content.trim();

      const optimistic: ChatMessage = {
        id: clientId,
        conversation_id: conversationId,
        sender_id: authUser.id,
        content: trimmed,
        client_id: clientId,
        created_at: now,
        status: "sending",
        is_optimistic: true,
      };
      setMessages((prev) => [...prev, optimistic]);

      try {
        const { error: insertErr } = await supabase.from("messages").insert({
          conversation_id: conversationId,
          sender_id: authUser.id,
          content: trimmed,
          client_id: clientId,
        });

        if (insertErr) throw insertErr;
        // Realtime INSERT event will swap the optimistic entry → confirmed
        processOfflineQueue(); // flush any other queued items
      } catch {
        // Mark as failed; queue for retry
        setMessages((prev) =>
          prev.map((m) =>
            m.client_id === clientId ? { ...m, status: "sending" } : m
          )
        );
        await enqueueMessage({
          clientId,
          conversationId,
          senderId: authUser.id,
          content: trimmed,
          createdAt: now,
        });
      }
    },
    [conversationId, authUser?.id]
  );

  // ── markRead ──────────────────────────────────────────────────────────────
  const markRead = useCallback(async () => {
    if (!conversationId || !authUser?.id) return;
    await supabase.from("conversation_reads").upsert(
      {
        conversation_id: conversationId,
        user_id: authUser.id,
        last_read_at: new Date().toISOString(),
      },
      { onConflict: "conversation_id,user_id" }
    );
  }, [conversationId, authUser?.id]);

  // ── sendTyping (throttled broadcast, 2s gate) ─────────────────────────────
  const sendTyping = useCallback(() => {
    if (!typingChannelRef.current || !authUser?.id) return;
    if (sendTypingTimerRef.current) return; // already sent recently
    typingChannelRef.current.send({
      type: "broadcast",
      event: "typing",
      payload: { user_id: authUser.id, name: selfName },
    });
    sendTypingTimerRef.current = setTimeout(() => {
      sendTypingTimerRef.current = null;
    }, 2000);
  }, [authUser?.id, selfName]);

  return {
    messages,
    loading,
    error,
    typingUsers,
    conversationId,
    sendMessage,
    markRead,
    sendTyping,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function computeStatus(
  msg: { sender_id: string; created_at: string },
  authUserId: string,
  otherLastRead: string | null
): MessageStatus {
  if (msg.sender_id !== authUserId) return "sent"; // incoming — show as sent (not "read" from our POV)
  if (!otherLastRead) return "sent";
  return otherLastRead >= msg.created_at ? "read" : "sent";
}

export async function loadConversationPreviews(
  coachId: string,
  athletes: { athlete_id: string }[]
): Promise<Record<string, { lastMsg: string | null; lastMsgAt: string | null; unread: number }>> {
  if (athletes.length === 0) return {};

  const athleteIds = athletes.map((a) => a.athlete_id);

  const { data: convs } = await supabase
    .from("conversations")
    .select("id, athlete_id")
    .eq("coach_id", coachId)
    .in("athlete_id", athleteIds);

  if (!convs || convs.length === 0) return {};

  const convIds = convs.map((c: { id: string }) => c.id);

  // Fetch last message per conversation (ordered desc, JS groups them)
  const { data: msgs } = await supabase
    .from("messages")
    .select("conversation_id, content, created_at, sender_id")
    .in("conversation_id", convIds)
    .order("created_at", { ascending: false })
    .limit(convIds.length * 5); // 5 per conv is ample for unread counting

  // Fetch coach's own read receipts
  const { data: reads } = await supabase
    .from("conversation_reads")
    .select("conversation_id, last_read_at")
    .eq("user_id", coachId)
    .in("conversation_id", convIds);

  const readMap: Record<string, string> = {};
  for (const r of reads ?? []) {
    readMap[r.conversation_id] = r.last_read_at;
  }

  const result: Record<string, { lastMsg: string | null; lastMsgAt: string | null; unread: number }> = {};

  for (const conv of convs) {
    const convMsgs = (msgs ?? []).filter(
      (m: { conversation_id: string }) => m.conversation_id === conv.id
    );
    const lastMsg = convMsgs[0] ?? null;
    const lastRead = readMap[conv.id] ?? null;

    const unread = convMsgs.filter(
      (m: { sender_id: string; created_at: string }) =>
        m.sender_id !== coachId && (!lastRead || m.created_at > lastRead)
    ).length;

    result[conv.athlete_id] = {
      lastMsg: lastMsg?.content ?? null,
      lastMsgAt: lastMsg?.created_at ?? null,
      unread,
    };
  }

  return result;
}

// ── Athlete-side unread count for a single coach conversation ────────────────
export function useAthleteUnread(params: {
  authUser: { id: string } | null;
  coachId: string | null;
  athleteId: string | null;
  chatOpen: boolean;
}): { unread: number; reset: () => void } {
  const { authUser, coachId, athleteId, chatOpen } = params;
  const [unread, setUnread] = useState(0);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const chatOpenRef = useRef(chatOpen);
  useEffect(() => { chatOpenRef.current = chatOpen; }, [chatOpen]);

  // Resolve conversation + initial count
  useEffect(() => {
    if (!authUser?.id || !coachId || !athleteId) {
      setConversationId(null);
      setUnread(0);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data: conv } = await supabase
        .from("conversations")
        .select("id")
        .eq("coach_id", coachId)
        .eq("athlete_id", athleteId)
        .maybeSingle();
      if (cancelled || !conv) return;
      setConversationId(conv.id);

      const { data: read } = await supabase
        .from("conversation_reads")
        .select("last_read_at")
        .eq("conversation_id", conv.id)
        .eq("user_id", athleteId)
        .maybeSingle();
      const lastRead = read?.last_read_at ?? null;

      let q = supabase
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("conversation_id", conv.id)
        .eq("sender_id", coachId);
      if (lastRead) q = q.gt("created_at", lastRead);
      const { count } = await q;
      if (!cancelled) setUnread(count ?? 0);
    })();
    return () => { cancelled = true; };
  }, [authUser?.id, coachId, athleteId]);

  // Realtime: increment on incoming coach messages while chat closed
  useEffect(() => {
    if (!conversationId || !coachId) return;
    const ch = supabase
      .channel(`athlete-unread-${conversationId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` },
        (payload: { new: { sender_id: string } }) => {
          if (payload.new.sender_id !== coachId) return;
          if (chatOpenRef.current) return;
          setUnread((u) => u + 1);
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [conversationId, coachId]);

  // Reset whenever chat opens
  useEffect(() => { if (chatOpen) setUnread(0); }, [chatOpen]);

  const reset = useCallback(() => setUnread(0), []);
  return { unread, reset };
}
