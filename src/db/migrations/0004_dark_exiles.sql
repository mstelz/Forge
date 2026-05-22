CREATE TABLE `goals` (
	`id` text PRIMARY KEY NOT NULL,
	`category` text NOT NULL,
	`title` text NOT NULL,
	`direction` text NOT NULL,
	`start_value` real,
	`target_value` real,
	`current_value` real,
	`unit` text,
	`linked_exercise_id` text,
	`linked_program_run_id` text,
	`deadline` integer,
	`notes` text,
	`status` text DEFAULT 'active' NOT NULL,
	`completed_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_goals_status` ON `goals` (`status`);--> statement-breakpoint
CREATE INDEX `idx_goals_category` ON `goals` (`category`);--> statement-breakpoint
CREATE INDEX `idx_goals_deadline` ON `goals` (`deadline`);--> statement-breakpoint
CREATE INDEX `idx_goals_updated_at` ON `goals` (`updated_at`);--> statement-breakpoint
CREATE INDEX `idx_goals_linked_exercise` ON `goals` (`linked_exercise_id`);--> statement-breakpoint
CREATE INDEX `idx_goals_linked_program_run` ON `goals` (`linked_program_run_id`);