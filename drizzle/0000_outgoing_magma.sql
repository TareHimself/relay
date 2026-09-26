CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`at` text NOT NULL,
	`actor` text NOT NULL,
	`project_id` text NOT NULL,
	`page_id` text,
	`revision` text
);
--> statement-breakpoint
CREATE TABLE `operations` (
	`id` text PRIMARY KEY NOT NULL,
	`path` text NOT NULL,
	`expected` text,
	`content` text NOT NULL,
	`actor` text NOT NULL,
	`event` text NOT NULL,
	`commit_hash` text,
	`status` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `pages` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`title` text NOT NULL,
	`path` text NOT NULL,
	`revision` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pages_path_unique` ON `pages` (`path`);--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`path` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `projects_path_unique` ON `projects` (`path`);