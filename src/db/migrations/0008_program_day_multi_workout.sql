ALTER TABLE program_days ADD COLUMN "order" integer NOT NULL DEFAULT 0;
ALTER TABLE program_days ADD COLUMN "label" text;
DROP INDEX IF EXISTS idx_program_days_program_week_day;
CREATE UNIQUE INDEX idx_program_days_program_week_day_order
  ON program_days(program_id, week_index, day_index, "order");
