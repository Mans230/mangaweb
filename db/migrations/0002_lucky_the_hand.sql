CREATE TABLE `link_codes` (
	`code` varchar(6) NOT NULL,
	`userId` bigint unsigned NOT NULL,
	`expiresAt` timestamp NOT NULL,
	CONSTRAINT `link_codes_code` PRIMARY KEY(`code`)
);
--> statement-breakpoint
ALTER TABLE `link_codes` ADD CONSTRAINT `link_codes_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;