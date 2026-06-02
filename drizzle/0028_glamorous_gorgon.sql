CREATE TABLE `user_email_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`provider` text NOT NULL,
	`email` text NOT NULL,
	`display_name` text,
	`refresh_token_enc` text,
	`access_token_enc` text,
	`access_token_expires_at` integer,
	`scopes` text,
	`is_default` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_accounts_user_provider_email_unique` ON `user_email_accounts` (`user_id`,`provider`,`email`);--> statement-breakpoint
CREATE INDEX `user_email_accounts_user_lookup` ON `user_email_accounts` (`user_id`);