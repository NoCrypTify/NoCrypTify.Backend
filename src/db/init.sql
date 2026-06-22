CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS notes (
  id                INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  note_id           UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  title             TEXT,
  content_encrypted TEXT NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notes_note_id ON notes (note_id);
