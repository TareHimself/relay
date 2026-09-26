CREATE TABLE `threads` (
	`id` text PRIMARY KEY NOT NULL,
	`page_id` text NOT NULL,
	`project_id` text NOT NULL,
	`status` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `events` ADD `thread_id` text;--> statement-breakpoint
ALTER TABLE `events` ADD `summary` text;