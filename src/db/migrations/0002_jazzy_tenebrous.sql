CREATE TABLE `session_set_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`performed_exercise_id` text NOT NULL,
	`exercise_id` text NOT NULL,
	`session_item_id` text NOT NULL,
	`planned_set_id` text,
	`order` integer NOT NULL,
	`reps` integer,
	`weight_kg` real,
	`rpe` real,
	`duration_sec` integer,
	`distance_m` real,
	`notes` text,
	`set_type` text NOT NULL,
	`status` text NOT NULL,
	`logged_at` integer NOT NULL,
	`rest_after_sec` integer,
	`entered_weight` real,
	`entered_weight_unit` text,
	`entered_distance` real,
	`entered_distance_unit` text,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_logs_session` ON `session_set_logs` (`session_id`);--> statement-breakpoint
CREATE INDEX `idx_logs_exercise_logged` ON `session_set_logs` (`exercise_id`,`logged_at`);--> statement-breakpoint
CREATE INDEX `idx_logs_session_performed` ON `session_set_logs` (`session_id`,`performed_exercise_id`,`order`);--> statement-breakpoint
CREATE INDEX `idx_logs_planned_set` ON `session_set_logs` (`planned_set_id`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`status` text NOT NULL,
	`source_type` text NOT NULL,
	`source_routine_id` text,
	`source_program_id` text,
	`source_program_week_index` integer,
	`source_program_day_index` integer,
	`template_snapshot` text,
	`live_structure` text NOT NULL,
	`rest_timer` text,
	`title` text,
	`notes` text,
	`started_at` integer NOT NULL,
	`ended_at` integer,
	`paused_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_sessions_status` ON `sessions` (`status`);--> statement-breakpoint
CREATE INDEX `idx_sessions_started_at` ON `sessions` (`started_at`);--> statement-breakpoint
CREATE INDEX `idx_sessions_source_routine` ON `sessions` (`source_routine_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_sessions_one_in_progress` ON `sessions` (`status`) WHERE status = 'in_progress';