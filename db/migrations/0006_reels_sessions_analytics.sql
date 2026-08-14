ALTER TABLE `users` ADD `telegramPhotoUrl` text;--> statement-breakpoint
ALTER TABLE `users` ADD `emailVerifiedAt` timestamp;--> statement-breakpoint
ALTER TABLE `users` ADD `notificationsTelegram` boolean NOT NULL DEFAULT false;--> statement-breakpoint
ALTER TABLE `users` ADD `dnd` boolean NOT NULL DEFAULT false;--> statement-breakpoint
ALTER TABLE `manga` ADD `hiddenAt` timestamp;--> statement-breakpoint
ALTER TABLE `manga` ADD `featuredAt` timestamp;--> statement-breakpoint
ALTER TABLE `manga` ADD `coverOverrideUrl` text;--> statement-breakpoint
ALTER TABLE `chapters` ADD `hiddenAt` timestamp;--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`userId` bigint unsigned NOT NULL,
	`token` varchar(512) NOT NULL,
	`userAgent` varchar(500),
	`ip` varchar(45),
	`lastSeenAt` timestamp NOT NULL DEFAULT (now()),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `sessions_id` PRIMARY KEY(`id`),
	CONSTRAINT `sessions_token_unique` UNIQUE(`token`)
);
--> statement-breakpoint
CREATE TABLE `email_codes` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`userId` bigint unsigned NOT NULL,
	`code` varchar(6) NOT NULL,
	`expiresAt` timestamp NOT NULL,
	CONSTRAINT `email_codes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `reels` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`userId` bigint unsigned NOT NULL,
	`videoUrl` text NOT NULL,
	`caption` varchar(300),
	`mangaId` bigint unsigned,
	`status` enum('pending','approved','rejected') NOT NULL DEFAULT 'pending',
	`rejectReason` text,
	`likesCount` int NOT NULL DEFAULT 0,
	`viewsCount` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `reels_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `reel_likes` (
	`reelId` bigint unsigned NOT NULL,
	`userId` bigint unsigned NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `reel_likes_reelId_userId_pk` PRIMARY KEY(`reelId`,`userId`)
);
--> statement-breakpoint
CREATE TABLE `reel_comments` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`reelId` bigint unsigned NOT NULL,
	`userId` bigint unsigned NOT NULL,
	`content` varchar(500) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `reel_comments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `page_views` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`path` varchar(300) NOT NULL,
	`userId` bigint unsigned,
	`ipHash` varchar(64),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `page_views_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `admin_logs` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`adminId` bigint unsigned NOT NULL,
	`action` varchar(100) NOT NULL,
	`targetType` varchar(50),
	`targetId` varchar(100),
	`meta` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `admin_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `update_requests` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`mangaId` bigint unsigned NOT NULL,
	`userId` bigint unsigned NOT NULL,
	`status` enum('pending','resolved') NOT NULL DEFAULT 'pending',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `update_requests_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `sessions` ADD CONSTRAINT `sessions_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `email_codes` ADD CONSTRAINT `email_codes_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `reels` ADD CONSTRAINT `reels_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `reels` ADD CONSTRAINT `reels_mangaId_manga_id_fk` FOREIGN KEY (`mangaId`) REFERENCES `manga`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `reel_likes` ADD CONSTRAINT `reel_likes_reelId_reels_id_fk` FOREIGN KEY (`reelId`) REFERENCES `reels`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `reel_likes` ADD CONSTRAINT `reel_likes_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `reel_comments` ADD CONSTRAINT `reel_comments_reelId_reels_id_fk` FOREIGN KEY (`reelId`) REFERENCES `reels`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `reel_comments` ADD CONSTRAINT `reel_comments_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `page_views` ADD CONSTRAINT `page_views_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `admin_logs` ADD CONSTRAINT `admin_logs_adminId_users_id_fk` FOREIGN KEY (`adminId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `update_requests` ADD CONSTRAINT `update_requests_mangaId_manga_id_fk` FOREIGN KEY (`mangaId`) REFERENCES `manga`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `update_requests` ADD CONSTRAINT `update_requests_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `sessions_user_idx` ON `sessions` (`userId`);--> statement-breakpoint
CREATE INDEX `email_codes_user_idx` ON `email_codes` (`userId`);--> statement-breakpoint
CREATE INDEX `reels_status_idx` ON `reels` (`status`);--> statement-breakpoint
CREATE INDEX `reels_user_idx` ON `reels` (`userId`);--> statement-breakpoint
CREATE INDEX `reel_comments_reel_idx` ON `reel_comments` (`reelId`,`id`);--> statement-breakpoint
CREATE INDEX `page_views_created_idx` ON `page_views` (`createdAt`);--> statement-breakpoint
CREATE INDEX `admin_logs_created_idx` ON `admin_logs` (`createdAt`);--> statement-breakpoint
CREATE INDEX `update_requests_status_idx` ON `update_requests` (`status`);
