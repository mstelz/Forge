-- Add soft-delete tombstone column to tables that support user-initiated deletion.
-- NULL means not deleted. Non-null is the epoch-ms timestamp of deletion.
ALTER TABLE exercises ADD COLUMN deleted_at INTEGER;
ALTER TABLE equipment ADD COLUMN deleted_at INTEGER;
ALTER TABLE routines ADD COLUMN deleted_at INTEGER;
ALTER TABLE goals ADD COLUMN deleted_at INTEGER;
ALTER TABLE programs ADD COLUMN deleted_at INTEGER;
