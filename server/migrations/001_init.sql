-- Daylog Phase 1 schema (Design Doc §3.2)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  timezone      TEXT NOT NULL DEFAULT 'Asia/Kolkata',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS categories (
  id         SERIAL PRIMARY KEY,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  color      TEXT NOT NULL,
  is_system  BOOLEAN NOT NULL DEFAULT false,
  UNIQUE (user_id, name)
);

CREATE TABLE IF NOT EXISTS days (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  log_date        DATE NOT NULL,
  reflection_note TEXT,
  status          TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','finalized')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  finalized_at    TIMESTAMPTZ,
  UNIQUE (user_id, log_date)
);

CREATE TABLE IF NOT EXISTS activities (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  day_id       UUID NOT NULL REFERENCES days(id) ON DELETE CASCADE,
  parent_id    UUID REFERENCES activities(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  category_id  INT NOT NULL REFERENCES categories(id),
  start_min    SMALLINT NOT NULL,
  end_min      SMALLINT NOT NULL,
  duration_min SMALLINT GENERATED ALWAYS AS (end_min - start_min) STORED,
  sort_order   SMALLINT NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (end_min > start_min),
  CHECK (start_min >= 0 AND end_min <= 1440)
);

CREATE INDEX IF NOT EXISTS idx_activities_day    ON activities(day_id);
CREATE INDEX IF NOT EXISTS idx_activities_parent ON activities(parent_id);
CREATE INDEX IF NOT EXISTS idx_days_user_date    ON days(user_id, log_date);
