ALTER TABLE `manga` ADD `siteViewCount` bigint unsigned DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE TABLE `support_tickets` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`userId` bigint unsigned NOT NULL,
	`subject` varchar(200) NOT NULL,
	`category` varchar(40) NOT NULL DEFAULT 'general',
	`status` varchar(20) NOT NULL DEFAULT 'open',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `support_tickets_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `support_ticket_messages` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`ticketId` bigint unsigned NOT NULL,
	`authorId` bigint unsigned NOT NULL,
	`isAdmin` boolean NOT NULL DEFAULT false,
	`body` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `support_ticket_messages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `support_tickets` ADD CONSTRAINT `support_tickets_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `support_ticket_messages` ADD CONSTRAINT `support_ticket_messages_ticketId_support_tickets_id_fk` FOREIGN KEY (`ticketId`) REFERENCES `support_tickets`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `support_ticket_messages` ADD CONSTRAINT `support_ticket_messages_authorId_users_id_fk` FOREIGN KEY (`authorId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `support_tickets_user_idx` ON `support_tickets` (`userId`);--> statement-breakpoint
CREATE INDEX `support_tickets_status_idx` ON `support_tickets` (`status`);--> statement-breakpoint
CREATE INDEX `support_ticket_messages_ticket_idx` ON `support_ticket_messages` (`ticketId`);