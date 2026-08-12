ALTER TABLE `chapters` ADD `url` text;--> statement-breakpoint
ALTER TABLE `chapters` ADD CONSTRAINT `chapters_manga_number_unique` UNIQUE(`mangaId`,`number`);
