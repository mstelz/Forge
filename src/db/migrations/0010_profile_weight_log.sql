CREATE TABLE `profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`avatar_data_url` text,
	`height_cm` real,
	`date_of_birth` text,
	`sex` text,
	`activity_level` text,
	`goal_type` text,
	`target_weight_kg` real,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `weight_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`profile_id` text NOT NULL REFERENCES `profiles`(`id`) ON DELETE CASCADE,
	`weight_kg` real NOT NULL,
	`date` text NOT NULL,
	`note` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_weight_logs_profile_date` ON `weight_logs` (`profile_id`,`date`);
