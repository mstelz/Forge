-- Repair for 0011_tombstones.
--
-- 0011 was hand-written without the statement separators drizzle's migrator
-- splits on, so it ran only its first statement: exercises got `deleted_at`
-- and equipment, routines, goals and programs did not. Every DELETE against
-- those four tables has been failing with "no such column: <table>.deleted_at"
-- ever since, which also means their soft-delete tombstones never reached any
-- client.
--
-- 0011 is left untouched — editing an applied migration changes its hash and
-- would make drizzle re-run it. This adds the four columns it missed. If a
-- database already has them (added out of band), the shim in
-- src/server/index.ts records this migration as applied rather than re-running
-- it, per ADR 0008.
ALTER TABLE equipment ADD COLUMN deleted_at INTEGER;--> statement-breakpoint
ALTER TABLE routines ADD COLUMN deleted_at INTEGER;--> statement-breakpoint
ALTER TABLE goals ADD COLUMN deleted_at INTEGER;--> statement-breakpoint
ALTER TABLE programs ADD COLUMN deleted_at INTEGER;
