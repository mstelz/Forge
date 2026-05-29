-- Soft-archive column for sessions. NULL = not archived.
-- Non-null = epoch-ms when the session was archived.
-- Archived sessions are excluded from default reconcile fetches but
-- preserved locally and accessible via the History page.
ALTER TABLE sessions ADD COLUMN archived_at INTEGER;
