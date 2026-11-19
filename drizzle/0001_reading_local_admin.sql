ALTER TABLE `reading_events` MODIFY COLUMN `user_id` int;--> statement-breakpoint
ALTER TABLE `reading_events` ADD `local_username` varchar(64);--> statement-breakpoint
CREATE INDEX `reading_events_local_created_idx` ON `reading_events` (`local_username`,`created_at`);