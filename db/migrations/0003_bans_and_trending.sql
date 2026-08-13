CREATE TABLE `banned_ips` (
	`ip` varchar(45) NOT NULL,
	`reason` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `banned_ips_ip` PRIMARY KEY(`ip`)
);
--> statement-breakpoint
ALTER TABLE `manga` ADD `is_trending` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `banned_at` timestamp;