-- Categories become soft-deletable: deleting an in-use category archives it,
-- so past days keep their name & color everywhere (reviews, analytics, export).
ALTER TABLE categories ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
