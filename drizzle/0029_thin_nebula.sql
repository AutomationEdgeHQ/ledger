CREATE TABLE `email_actions` (
	`id` text PRIMARY KEY NOT NULL,
	`message_id` text NOT NULL,
	`account_id` text NOT NULL,
	`user_id` text NOT NULL,
	`action_type` text NOT NULL,
	`payload` text,
	`mode` text NOT NULL,
	`actor` text DEFAULT 'agent' NOT NULL,
	`confidence` integer,
	`was_corrected` integer DEFAULT 0 NOT NULL,
	`corrected_to_action_id` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `email_actions_message_idx` ON `email_actions` (`message_id`);--> statement-breakpoint
CREATE INDEX `email_actions_user_created_idx` ON `email_actions` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `email_actions_pending_auto_idx` ON `email_actions` (`mode`,`created_at`);--> statement-breakpoint
CREATE TABLE `email_corrections` (
	`id` text PRIMARY KEY NOT NULL,
	`action_id` text NOT NULL,
	`user_id` text NOT NULL,
	`original_action` text NOT NULL,
	`corrected_action` text NOT NULL,
	`user_note` text,
	`category` text,
	`sender` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `email_corrections_user_created_idx` ON `email_corrections` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `email_corrections_user_cat_sender_idx` ON `email_corrections` (`user_id`,`category`,`sender`);--> statement-breakpoint
CREATE TABLE `email_guardrails` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`scope` text NOT NULL,
	`scope_value` text,
	`category` text,
	`mode` text DEFAULT 'shadow' NOT NULL,
	`confidence_threshold` integer DEFAULT 80 NOT NULL,
	`undo_window_sec` integer DEFAULT 60 NOT NULL,
	`example_count` integer DEFAULT 0 NOT NULL,
	`graduated_at` integer,
	`last_correction_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `email_guardrails_user_scope_unique` ON `email_guardrails` (`user_id`,`scope`,`scope_value`);--> statement-breakpoint
CREATE INDEX `email_guardrails_user_idx` ON `email_guardrails` (`user_id`);--> statement-breakpoint
CREATE TABLE `email_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`user_id` text NOT NULL,
	`provider_message_id` text NOT NULL,
	`thread_id` text NOT NULL,
	`headers` text NOT NULL,
	`body_enc` text,
	`received_at` integer NOT NULL,
	`classification` text,
	`summary` text,
	`confidence` integer,
	`extracted` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`cleared_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `email_messages_account_provider_id_unique` ON `email_messages` (`account_id`,`provider_message_id`);--> statement-breakpoint
CREATE INDEX `email_messages_user_status_idx` ON `email_messages` (`user_id`,`status`,`received_at`);--> statement-breakpoint
CREATE INDEX `email_messages_thread_idx` ON `email_messages` (`account_id`,`thread_id`);