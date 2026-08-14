-- Cache fetched chapter pages so the reader keeps working when a source is down
ALTER TABLE `chapters` ADD COLUMN `cachedPages` json NULL,
  ADD COLUMN `pagesCachedAt` timestamp NULL;
