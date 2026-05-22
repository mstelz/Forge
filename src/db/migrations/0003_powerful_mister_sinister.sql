CREATE TABLE `program_days` (
	`id` text PRIMARY KEY NOT NULL,
	`program_id` text NOT NULL,
	`week_index` integer NOT NULL,
	`day_index` integer NOT NULL,
	`routine_id` text,
	`is_rest_day` integer DEFAULT 0 NOT NULL,
	`notes` text,
	FOREIGN KEY (`program_id`) REFERENCES `programs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_program_days_program_week_day` ON `program_days` (`program_id`,`week_index`,`day_index`);--> statement-breakpoint
CREATE INDEX `idx_program_days_routine` ON `program_days` (`routine_id`);--> statement-breakpoint
CREATE TABLE `program_run_day_states` (
	`id` text PRIMARY KEY NOT NULL,
	`program_run_id` text NOT NULL,
	`week_index` integer NOT NULL,
	`day_index` integer NOT NULL,
	`status` text NOT NULL,
	`session_id` text,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`program_run_id`) REFERENCES `program_runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_prds_run_week_day` ON `program_run_day_states` (`program_run_id`,`week_index`,`day_index`);--> statement-breakpoint
CREATE INDEX `idx_prds_session` ON `program_run_day_states` (`session_id`);--> statement-breakpoint
CREATE TABLE `program_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`program_id` text NOT NULL,
	`status` text NOT NULL,
	`started_at` integer NOT NULL,
	`ended_at` integer,
	`current_week_index` integer DEFAULT 0 NOT NULL,
	`current_day_index` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`program_id`) REFERENCES `programs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_program_runs_program` ON `program_runs` (`program_id`);--> statement-breakpoint
CREATE INDEX `idx_program_runs_status` ON `program_runs` (`status`);--> statement-breakpoint
CREATE TABLE `programs` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`duration_weeks` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_programs_name` ON `programs` (`name`);--> statement-breakpoint
CREATE INDEX `idx_programs_updated_at` ON `programs` (`updated_at`);