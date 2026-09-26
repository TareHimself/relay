CREATE TABLE `tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`hash` text NOT NULL,
	`scope` text NOT NULL,
	`project_id` text,
	`created_at` text NOT NULL,
	`last_used_at` text,
	`expires_at` text,
	`revoked_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tokens_hash_unique` ON `tokens` (`hash`);