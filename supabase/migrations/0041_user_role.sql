-- ============================================================================
-- Migration 004 — Persist user role in profiles table
-- Adds a `role` column so the role chosen in the role picker is stored in the
-- database and survives device switches, localStorage clears, and new logins.
-- ============================================================================

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS role TEXT
  CHECK (role IN ('athlete', 'coach', 'athlete_web'));
