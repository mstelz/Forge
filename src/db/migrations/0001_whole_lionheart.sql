CREATE TABLE `routine_blocks` (
	`id` text PRIMARY KEY NOT NULL,
	`routine_id` text NOT NULL,
	`order` integer NOT NULL,
	`type` text NOT NULL,
	`round_count` integer,
	`rest_sec` integer,
	`tempo` text,
	`notes` text,
	FOREIGN KEY (`routine_id`) REFERENCES `routines`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_routine_blocks_routine_order` ON `routine_blocks` (`routine_id`,`order`);--> statement-breakpoint
CREATE TABLE `routine_items` (
	`id` text PRIMARY KEY NOT NULL,
	`block_id` text NOT NULL,
	`routine_id` text NOT NULL,
	`order` integer NOT NULL,
	`exercise_id` text NOT NULL,
	`set_count` integer NOT NULL,
	`rep_mode` text NOT NULL,
	`rpe_mode` text NOT NULL,
	`set_type_mode` text NOT NULL,
	`uniform_reps` integer,
	`uniform_reps_min` integer,
	`uniform_reps_max` integer,
	`uniform_rpe` real,
	`uniform_set_type` text,
	`duration_sec` integer,
	`duration_min_sec` integer,
	`duration_max_sec` integer,
	`notes` text,
	FOREIGN KEY (`block_id`) REFERENCES `routine_blocks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`routine_id`) REFERENCES `routines`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_routine_items_block_order` ON `routine_items` (`block_id`,`order`);--> statement-breakpoint
CREATE INDEX `idx_routine_items_routine` ON `routine_items` (`routine_id`);--> statement-breakpoint
CREATE INDEX `idx_routine_items_exercise` ON `routine_items` (`exercise_id`);--> statement-breakpoint
CREATE TABLE `routine_set_targets` (
	`id` text PRIMARY KEY NOT NULL,
	`item_id` text NOT NULL,
	`routine_id` text NOT NULL,
	`order` integer NOT NULL,
	`reps` integer,
	`reps_min` integer,
	`reps_max` integer,
	`rpe` real,
	`set_type` text NOT NULL,
	`technique_notes` text,
	FOREIGN KEY (`item_id`) REFERENCES `routine_items`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`routine_id`) REFERENCES `routines`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_routine_set_targets_item_order` ON `routine_set_targets` (`item_id`,`order`);--> statement-breakpoint
CREATE TABLE `routines` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`notes` text,
	`estimated_duration_min` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_routines_name` ON `routines` (`name`);--> statement-breakpoint
CREATE INDEX `idx_routines_updated_at` ON `routines` (`updated_at`);