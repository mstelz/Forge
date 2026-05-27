CREATE TABLE `settings` (
	`id` text PRIMARY KEY NOT NULL,
	`weight_unit` text DEFAULT 'kg' NOT NULL,
	`distance_unit` text DEFAULT 'km' NOT NULL,
	`height_unit` text DEFAULT 'cm' NOT NULL,
	`timezone` text DEFAULT 'America/Chicago' NOT NULL,
	`week_starts_on` text DEFAULT 'mon' NOT NULL,
	`show_rpe` integer DEFAULT 1 NOT NULL,
	`show_cardio` integer DEFAULT 1 NOT NULL,
	`theme` text DEFAULT 'system' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
