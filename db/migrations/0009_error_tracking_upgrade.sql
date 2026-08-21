-- Error-tracking upgrade: fingerprint grouping + status workflow + client ingestion
ALTER TABLE `error_logs`
  ADD COLUMN `fingerprint` varchar(64) NULL,
  ADD COLUMN `status` varchar(16) NOT NULL DEFAULT 'open',
  ADD COLUMN `count` int NOT NULL DEFAULT 1,
  ADD COLUMN `lastSeenAt` timestamp NOT NULL DEFAULT (now());

CREATE UNIQUE INDEX `error_logs_fingerprint_uq` ON `error_logs` (`fingerprint`);
CREATE INDEX `error_logs_status_idx` ON `error_logs` (`status`);
CREATE INDEX `error_logs_lastseen_idx` ON `error_logs` (`lastSeenAt`);
