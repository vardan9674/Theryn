-- ============================================================================
-- Theryn — Messaging previews RPC + supporting indexes
-- Fixes an issue where loadConversationPreviews in JS could starve quiet
-- conversations: limiting to N*5 most-recent messages across all convs meant
-- one chatty conv could fill the budget. This RPC uses DISTINCT ON to return
-- exactly one last-message row per conversation, plus an accurate unread count
-- scoped to the caller, in a single round-trip.
-- ============================================================================

-- ── Indexes ──────────────────────────────────────────────────────────────────
-- Lookup "my convs as athlete" (previews on athlete side, future use).
CREATE INDEX IF NOT EXISTS idx_conversations_athlete
  ON conversations (athlete_id);

-- Unread counting filters by (conversation_id, sender_id != me, created_at > last_read).
-- The existing (conversation_id, created_at) already covers the first + third;
-- adding sender_id last keeps the index useful for both ordering and the filter.
CREATE INDEX IF NOT EXISTS idx_messages_conv_created_sender
  ON messages (conversation_id, created_at DESC, sender_id);


-- ── RPC: conversation previews for the caller ──────────────────────────────
-- Returns one row per conversation the caller participates in, with the last
-- message (if any) and an unread count scoped to messages from the other party
-- created after the caller's last_read_at.
--
-- SECURITY INVOKER so RLS still applies; the policies already restrict rows to
-- participants, which is exactly the scoping we want.
CREATE OR REPLACE FUNCTION get_conversation_previews()
RETURNS TABLE (
  conversation_id UUID,
  coach_id        UUID,
  athlete_id      UUID,
  last_content    TEXT,
  last_sender_id  UUID,
  last_created_at TIMESTAMPTZ,
  unread_count    INTEGER
)
LANGUAGE sql
SECURITY INVOKER
STABLE
AS $$
  WITH my_convs AS (
    SELECT c.id, c.coach_id, c.athlete_id
    FROM conversations c
    WHERE c.coach_id = auth.uid() OR c.athlete_id = auth.uid()
  ),
  last_msgs AS (
    SELECT DISTINCT ON (m.conversation_id)
      m.conversation_id,
      m.content,
      m.sender_id,
      m.created_at
    FROM messages m
    JOIN my_convs mc ON mc.id = m.conversation_id
    ORDER BY m.conversation_id, m.created_at DESC
  ),
  my_reads AS (
    SELECT r.conversation_id, r.last_read_at
    FROM conversation_reads r
    WHERE r.user_id = auth.uid()
  )
  SELECT
    mc.id AS conversation_id,
    mc.coach_id,
    mc.athlete_id,
    lm.content      AS last_content,
    lm.sender_id    AS last_sender_id,
    lm.created_at   AS last_created_at,
    COALESCE((
      SELECT COUNT(*)::INTEGER
      FROM messages m
      WHERE m.conversation_id = mc.id
        AND m.sender_id <> auth.uid()
        AND (mr.last_read_at IS NULL OR m.created_at > mr.last_read_at)
    ), 0) AS unread_count
  FROM my_convs mc
  LEFT JOIN last_msgs lm ON lm.conversation_id = mc.id
  LEFT JOIN my_reads  mr ON mr.conversation_id = mc.id;
$$;

GRANT EXECUTE ON FUNCTION get_conversation_previews() TO authenticated;
