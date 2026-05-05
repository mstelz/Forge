CREATE TABLE `equipment` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_equipment_name_lower` ON `equipment` (lower("name"));--> statement-breakpoint
CREATE TABLE `exercises` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`primary_muscles` text DEFAULT '[]' NOT NULL,
	`secondary_muscles` text DEFAULT '[]' NOT NULL,
	`equipment_ids` text DEFAULT '[]' NOT NULL,
	`aliases` text DEFAULT '[]' NOT NULL,
	`description` text,
	`instructions` text,
	`video_urls` text DEFAULT '[]' NOT NULL,
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`last_used_at` integer
);
--> statement-breakpoint
CREATE INDEX `idx_exercises_name` ON `exercises` (`name`);--> statement-breakpoint
CREATE INDEX `idx_exercises_type` ON `exercises` (`type`);--> statement-breakpoint
CREATE INDEX `idx_exercises_updated_at` ON `exercises` (`updated_at`);--> statement-breakpoint
CREATE TABLE `meta` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `pending_writes` (
	`id` text PRIMARY KEY NOT NULL,
	`entity` text NOT NULL,
	`op` text NOT NULL,
	`payload` text NOT NULL,
	`created_at` integer NOT NULL,
	`retries` integer DEFAULT 0 NOT NULL,
	`last_error` text
);
--> statement-breakpoint
CREATE INDEX `idx_pending_writes_created_at` ON `pending_writes` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_pending_writes_entity_op` ON `pending_writes` (`entity`,`op`);