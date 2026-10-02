-- ============================================================================
-- Theryn — In-App Messaging (v1)
-- 3 new tables: conversations, messages, conversation_reads
-- Auto-provision conversations when coach_athletes.status → 'accepted'
-- ============================================================================

-- ── CONVERSATIONS ─────────────────────────────────────────────────────────────
-- One row per coach-athlete pair
CREATE TABLE conversations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  athlete_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (coach_id, athlete_id)
);

ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "conv_participant_select" ON conversations FOR SELECT
  USING (auth.uid() = coach_id OR auth.uid() = athlete_id);

CREATE POLICY "conv_participant_insert" ON conversations FOR INSERT
  WITH CHECK (auth.uid() = coach_id OR auth.uid() = athlete_id);


-- ── MESSAGES ──────────────────────────────────────────────────────────────────
-- client_id is a frontend-generated UUID for optimistic UI idempotency
CREATE TABLE messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id       UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content         TEXT NOT NULL CHECK (char_length(content) > 0 AND char_length(content) <= 4000),
  client_id       UUID NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (conversation_id, client_id)
);

CREATE INDEX idx_messages_conv_created ON messages (conversation_id, created_at ASC);
CREATE INDEX idx_messages_sender ON messages (sender_id);

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- Helper: is the calling user a participant of this conversation?
-- SECURITY DEFINER avoids RLS recursion when policies call this function.
CREATE OR REPLACE FUNCTION is_conversation_participant(conv_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM conversations
    WHERE id = conv_id
      AND (coach_id = auth.uid() OR athlete_id = auth.uid())
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE POLICY "msg_participant_select" ON messages FOR SELECT
  USING (is_conversation_participant(conversation_id));

-- Only the sender themselves may insert their own messages
CREATE POLICY "msg_sender_insert" ON messages FOR INSERT
  WITH CHECK (
    sender_id = auth.uid()
    AND is_conversation_participant(conversation_id)
  );


-- ── CONVERSATION READS ────────────────────────────────────────────────────────
-- Tracks the last-read position per user per conversation (for read receipts)
CREATE TABLE conversation_reads (
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  last_read_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, user_id)
);

ALTER TABLE conversation_reads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reads_select" ON conversation_reads FOR SELECT
  USING (user_id = auth.uid() OR is_conversation_participant(conversation_id));

CREATE POLICY "reads_insert" ON conversation_reads FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND is_conversation_participant(conversation_id)
  );

CREATE POLICY "reads_update" ON conversation_reads FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());


-- ── AUTO-PROVISION TRIGGER ────────────────────────────────────────────────────
-- NOTE: targets coach_athletes (the actual runtime table), not coaching_relationships
-- (the migration file references coaching_relationships but the app uses coach_athletes)
CREATE OR REPLACE FUNCTION provision_conversation_on_accept()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'accepted' AND (TG_OP = 'INSERT' OR OLD.status <> 'accepted') THEN
    INSERT INTO conversations (coach_id, athlete_id)
    VALUES (NEW.coach_id, NEW.athlete_id)
    ON CONFLICT (coach_id, athlete_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_provision_conversation
  AFTER INSERT OR UPDATE OF status ON coach_athletes
  FOR EACH ROW EXECUTE FUNCTION provision_conversation_on_accept();


-- ── REALTIME ──────────────────────────────────────────────────────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE messages;
ALTER PUBLICATION supabase_realtime ADD TABLE conversation_reads;


-- ── ONE-TIME BACKFILL ─────────────────────────────────────────────────────────
-- Provision conversations for all existing accepted relationships.
-- Safe to run multiple times (ON CONFLICT DO NOTHING).
INSERT INTO conversations (coach_id, athlete_id)
SELECT coach_id, athlete_id FROM coach_athletes WHERE status = 'accepted'
ON CONFLICT (coach_id, athlete_id) DO NOTHING;
