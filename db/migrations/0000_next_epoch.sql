CREATE TABLE `chapters` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`mangaId` bigint unsigned NOT NULL,
	`number` decimal(8,1) NOT NULL,
	`title` varchar(500),
	`pageCount` int NOT NULL DEFAULT 0,
	`publishedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `chapters_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `comments` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`userId` bigint unsigned NOT NULL,
	`mangaId` bigint unsigned NOT NULL,
	`chapterId` bigint unsigned,
	`content` text NOT NULL,
	`isSpoiler` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `comments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `favorites` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`userId` bigint unsigned NOT NULL,
	`mangaId` bigint unsigned NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `favorites_id` PRIMARY KEY(`id`),
	CONSTRAINT `favorites_user_manga_unique` UNIQUE(`userId`,`mangaId`)
);
--> statement-breakpoint
CREATE TABLE `follows` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`userId` bigint unsigned NOT NULL,
	`mangaId` bigint unsigned NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `follows_id` PRIMARY KEY(`id`),
	CONSTRAINT `follows_user_manga_unique` UNIQUE(`userId`,`mangaId`)
);
--> statement-breakpoint
CREATE TABLE `manga` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`slug` varchar(300) NOT NULL,
	`title` varchar(500) NOT NULL,
	`altTitles` json,
	`description` text,
	`coverUrl` text,
	`type` enum('manga','manhwa','manhua') NOT NULL DEFAULT 'manhwa',
	`status` enum('ongoing','completed') NOT NULL DEFAULT 'ongoing',
	`genres` json,
	`rating` decimal(3,2) NOT NULL DEFAULT 0,
	`ratingCount` int NOT NULL DEFAULT 0,
	`viewCount` bigint unsigned NOT NULL DEFAULT 0,
	`chapterCount` int NOT NULL DEFAULT 0,
	`isAdult` boolean NOT NULL DEFAULT false,
	`sourceId` bigint unsigned NOT NULL,
	`sourceUrl` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `manga_id` PRIMARY KEY(`id`),
	CONSTRAINT `manga_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `ratings` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`userId` bigint unsigned NOT NULL,
	`mangaId` bigint unsigned NOT NULL,
	`stars` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `ratings_id` PRIMARY KEY(`id`),
	CONSTRAINT `ratings_user_manga_unique` UNIQUE(`userId`,`mangaId`)
);
--> statement-breakpoint
CREATE TABLE `reading_progress` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`userId` bigint unsigned NOT NULL,
	`mangaId` bigint unsigned NOT NULL,
	`chapterId` bigint unsigned NOT NULL,
	`lastPage` int NOT NULL DEFAULT 0,
	`updatedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `reading_progress_id` PRIMARY KEY(`id`),
	CONSTRAINT `reading_progress_user_manga_unique` UNIQUE(`userId`,`mangaId`)
);
--> statement-breakpoint
CREATE TABLE `requests` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`userId` bigint unsigned,
	`title` varchar(500) NOT NULL,
	`sourceUrl` text,
	`note` text,
	`status` enum('pending','added','rejected') NOT NULL DEFAULT 'pending',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `requests_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sources` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`name` varchar(100) NOT NULL,
	`baseUrl` varchar(500) NOT NULL,
	`status` enum('active','paused','blocked') NOT NULL DEFAULT 'active',
	`lastScanAt` timestamp,
	`mangaCount` int NOT NULL DEFAULT 0,
	CONSTRAINT `sources_id` PRIMARY KEY(`id`),
	CONSTRAINT `sources_name_unique` UNIQUE(`name`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`email` varchar(320),
	`passwordHash` varchar(255),
	`name` varchar(255),
	`avatarUrl` text,
	`telegramId` varchar(64),
	`telegramUsername` varchar(64),
	`googleId` varchar(255),
	`role` enum('user','admin') NOT NULL DEFAULT 'user',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()),
	`lastSignInAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_email_unique` UNIQUE(`email`),
	CONSTRAINT `users_telegramId_unique` UNIQUE(`telegramId`),
	CONSTRAINT `users_googleId_unique` UNIQUE(`googleId`)
);
--> statement-breakpoint
ALTER TABLE `chapters` ADD CONSTRAINT `chapters_mangaId_manga_id_fk` FOREIGN KEY (`mangaId`) REFERENCES `manga`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `comments` ADD CONSTRAINT `comments_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `comments` ADD CONSTRAINT `comments_mangaId_manga_id_fk` FOREIGN KEY (`mangaId`) REFERENCES `manga`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `comments` ADD CONSTRAINT `comments_chapterId_chapters_id_fk` FOREIGN KEY (`chapterId`) REFERENCES `chapters`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `favorites` ADD CONSTRAINT `favorites_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `favorites` ADD CONSTRAINT `favorites_mangaId_manga_id_fk` FOREIGN KEY (`mangaId`) REFERENCES `manga`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `follows` ADD CONSTRAINT `follows_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `follows` ADD CONSTRAINT `follows_mangaId_manga_id_fk` FOREIGN KEY (`mangaId`) REFERENCES `manga`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `manga` ADD CONSTRAINT `manga_sourceId_sources_id_fk` FOREIGN KEY (`sourceId`) REFERENCES `sources`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ratings` ADD CONSTRAINT `ratings_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ratings` ADD CONSTRAINT `ratings_mangaId_manga_id_fk` FOREIGN KEY (`mangaId`) REFERENCES `manga`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `reading_progress` ADD CONSTRAINT `reading_progress_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `reading_progress` ADD CONSTRAINT `reading_progress_mangaId_manga_id_fk` FOREIGN KEY (`mangaId`) REFERENCES `manga`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `reading_progress` ADD CONSTRAINT `reading_progress_chapterId_chapters_id_fk` FOREIGN KEY (`chapterId`) REFERENCES `chapters`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `requests` ADD CONSTRAINT `requests_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `chapters_manga_idx` ON `chapters` (`mangaId`);--> statement-breakpoint
CREATE INDEX `chapters_published_idx` ON `chapters` (`publishedAt`);--> statement-breakpoint
CREATE INDEX `comments_manga_idx` ON `comments` (`mangaId`);--> statement-breakpoint
CREATE INDEX `comments_chapter_idx` ON `comments` (`chapterId`);--> statement-breakpoint
CREATE INDEX `manga_status_idx` ON `manga` (`status`);--> statement-breakpoint
CREATE INDEX `manga_view_count_idx` ON `manga` (`viewCount`);--> statement-breakpoint
CREATE INDEX `manga_source_idx` ON `manga` (`sourceId`);--> statement-breakpoint
CREATE INDEX `requests_status_idx` ON `requests` (`status`);