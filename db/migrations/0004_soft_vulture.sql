CREATE TABLE `community_messages` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`mangaId` bigint unsigned NOT NULL,
	`userId` bigint unsigned NOT NULL,
	`body` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `community_messages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `reports` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`userId` bigint unsigned NOT NULL,
	`mangaId` bigint unsigned,
	`chapterId` bigint unsigned,
	`reason` enum('porn','broken','wrong_translation','other') NOT NULL,
	`details` text,
	`status` enum('pending','resolved','dismissed') NOT NULL DEFAULT 'pending',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `reports_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `user_list_items` (
	`listId` bigint unsigned NOT NULL,
	`mangaId` bigint unsigned NOT NULL,
	`addedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `user_list_items_listId_mangaId_pk` PRIMARY KEY(`listId`,`mangaId`)
);
--> statement-breakpoint
CREATE TABLE `user_lists` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`userId` bigint unsigned NOT NULL,
	`name` varchar(80) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `user_lists_id` PRIMARY KEY(`id`),
	CONSTRAINT `user_lists_user_name_unique` UNIQUE(`userId`,`name`)
);
--> statement-breakpoint
ALTER TABLE `users` ADD `username` varchar(24);--> statement-breakpoint
ALTER TABLE `users` ADD `usernameChangedAt` timestamp;--> statement-breakpoint
ALTER TABLE `users` ADD `bannerUrl` text;--> statement-breakpoint
ALTER TABLE `users` ADD CONSTRAINT `users_username_unique` UNIQUE(`username`);--> statement-breakpoint
ALTER TABLE `community_messages` ADD CONSTRAINT `community_messages_mangaId_manga_id_fk` FOREIGN KEY (`mangaId`) REFERENCES `manga`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `community_messages` ADD CONSTRAINT `community_messages_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `reports` ADD CONSTRAINT `reports_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `reports` ADD CONSTRAINT `reports_mangaId_manga_id_fk` FOREIGN KEY (`mangaId`) REFERENCES `manga`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `reports` ADD CONSTRAINT `reports_chapterId_chapters_id_fk` FOREIGN KEY (`chapterId`) REFERENCES `chapters`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `user_list_items` ADD CONSTRAINT `user_list_items_listId_user_lists_id_fk` FOREIGN KEY (`listId`) REFERENCES `user_lists`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `user_list_items` ADD CONSTRAINT `user_list_items_mangaId_manga_id_fk` FOREIGN KEY (`mangaId`) REFERENCES `manga`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `user_lists` ADD CONSTRAINT `user_lists_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `community_messages_manga_id_idx` ON `community_messages` (`mangaId`,`id`);--> statement-breakpoint
CREATE INDEX `reports_status_idx` ON `reports` (`status`);--> statement-breakpoint
CREATE INDEX `reports_user_idx` ON `reports` (`userId`);