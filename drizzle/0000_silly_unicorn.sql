CREATE TABLE `app_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `credit_ledger` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`delta_cents` integer NOT NULL,
	`type` text NOT NULL,
	`ref_id` text,
	`note` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_ledger_user` ON `credit_ledger` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `stripe_events` (
	`event_id` text PRIMARY KEY NOT NULL,
	`processed_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`password_hash` text NOT NULL,
	`email_verified_at` integer,
	`free_uses_remaining` integer DEFAULT 2 NOT NULL,
	`balance_cents` integer DEFAULT 0 NOT NULL,
	`is_admin` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE TABLE `verification_codes` (
	`email` text PRIMARY KEY NOT NULL,
	`code_hash` text NOT NULL,
	`expires_at` integer NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`last_sent_at` integer NOT NULL
);
