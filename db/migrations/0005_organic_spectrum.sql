CREATE TABLE `communities` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`slug` varchar(150) NOT NULL,
	`name` varchar(120) NOT NULL,
	`description` text,
	`imageUrl` text,
	`color` varchar(7),
	`isPrivate` boolean NOT NULL DEFAULT false,
	`ownerId` bigint unsigned NOT NULL,
	`mangaId` bigint unsigned,
	`slowModeSeconds` int NOT NULL DEFAULT 0,
	`archivedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `communities_id` PRIMARY KEY(`id`),
	CONSTRAINT `communities_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `community_bans` (
	`communityId` bigint unsigned NOT NULL,
	`userId` bigint unsigned NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `community_bans_communityId_userId_pk` PRIMARY KEY(`communityId`,`userId`)
);
--> statement-breakpoint
CREATE TABLE `community_chat_messages` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`communityId` bigint unsigned NOT NULL,
	`userId` bigint unsigned NOT NULL,
	`content` varchar(500) NOT NULL,
	`imageUrl` text,
	`pinnedAt` timestamp,
	`deletedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `community_chat_messages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `community_create_requests` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`userId` bigint unsigned NOT NULL,
	`payload` json NOT NULL,
	`status` enum('pending','approved','rejected') NOT NULL DEFAULT 'pending',
	`rejectReason` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `community_create_requests_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `community_invites` (
	`communityId` bigint unsigned NOT NULL,
	`code` varchar(32) NOT NULL,
	`updatedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `community_invites_communityId` PRIMARY KEY(`communityId`),
	CONSTRAINT `community_invites_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE TABLE `community_join_requests` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`communityId` bigint unsigned NOT NULL,
	`userId` bigint unsigned NOT NULL,
	`status` enum('pending','approved','rejected') NOT NULL DEFAULT 'pending',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `community_join_requests_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `community_members` (
	`communityId` bigint unsigned NOT NULL,
	`userId` bigint unsigned NOT NULL,
	`roleId` bigint unsigned,
	`mutedUntil` timestamp,
	`lastMessageAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `community_members_communityId_userId_pk` PRIMARY KEY(`communityId`,`userId`)
);
--> statement-breakpoint
CREATE TABLE `community_roles` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`communityId` bigint unsigned NOT NULL,
	`name` varchar(60) NOT NULL,
	`canModerate` boolean NOT NULL DEFAULT false,
	CONSTRAINT `community_roles_id` PRIMARY KEY(`id`),
	CONSTRAINT `community_roles_community_name_unique` UNIQUE(`communityId`,`name`)
);
--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`userId` bigint unsigned NOT NULL,
	`type` varchar(32) NOT NULL,
	`payload` json,
	`readAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `notifications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `site_settings` (
	`key` varchar(100) NOT NULL,
	`value` text,
	CONSTRAINT `site_settings_key` PRIMARY KEY(`key`)
);
--> statement-breakpoint
ALTER TABLE `reports` ADD `communityMessageId` bigint unsigned;--> statement-breakpoint
ALTER TABLE `communities` ADD CONSTRAINT `communities_ownerId_users_id_fk` FOREIGN KEY (`ownerId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `communities` ADD CONSTRAINT `communities_mangaId_manga_id_fk` FOREIGN KEY (`mangaId`) REFERENCES `manga`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `community_bans` ADD CONSTRAINT `community_bans_communityId_communities_id_fk` FOREIGN KEY (`communityId`) REFERENCES `communities`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `community_bans` ADD CONSTRAINT `community_bans_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `community_chat_messages` ADD CONSTRAINT `community_chat_messages_communityId_communities_id_fk` FOREIGN KEY (`communityId`) REFERENCES `communities`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `community_chat_messages` ADD CONSTRAINT `community_chat_messages_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `community_create_requests` ADD CONSTRAINT `community_create_requests_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `community_invites` ADD CONSTRAINT `community_invites_communityId_communities_id_fk` FOREIGN KEY (`communityId`) REFERENCES `communities`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `community_join_requests` ADD CONSTRAINT `community_join_requests_communityId_communities_id_fk` FOREIGN KEY (`communityId`) REFERENCES `communities`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `community_join_requests` ADD CONSTRAINT `community_join_requests_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `community_members` ADD CONSTRAINT `community_members_communityId_communities_id_fk` FOREIGN KEY (`communityId`) REFERENCES `communities`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `community_members` ADD CONSTRAINT `community_members_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `community_members` ADD CONSTRAINT `community_members_roleId_community_roles_id_fk` FOREIGN KEY (`roleId`) REFERENCES `community_roles`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `community_roles` ADD CONSTRAINT `community_roles_communityId_communities_id_fk` FOREIGN KEY (`communityId`) REFERENCES `communities`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `communities_owner_idx` ON `communities` (`ownerId`);--> statement-breakpoint
CREATE INDEX `community_chat_messages_community_id_idx` ON `community_chat_messages` (`communityId`,`id`);--> statement-breakpoint
CREATE INDEX `community_create_requests_status_idx` ON `community_create_requests` (`status`);--> statement-breakpoint
CREATE INDEX `community_create_requests_user_idx` ON `community_create_requests` (`userId`);--> statement-breakpoint
CREATE INDEX `community_join_requests_community_user_idx` ON `community_join_requests` (`communityId`,`userId`);--> statement-breakpoint
CREATE INDEX `community_join_requests_status_idx` ON `community_join_requests` (`status`);--> statement-breakpoint
CREATE INDEX `community_members_user_idx` ON `community_members` (`userId`);--> statement-breakpoint
CREATE INDEX `notifications_user_read_idx` ON `notifications` (`userId`,`readAt`);--> statement-breakpoint
ALTER TABLE `reports` ADD CONSTRAINT `reports_communityMessageId_community_chat_messages_id_fk` FOREIGN KEY (`communityMessageId`) REFERENCES `community_chat_messages`(`id`) ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
INSERT INTO `site_settings` (`key`, `value`) VALUES ('community.user_enabled','1'),('community.manga_enabled','1');
