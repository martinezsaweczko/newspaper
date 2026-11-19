CREATE TABLE `reading_events` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`edition_path` varchar(1024) NOT NULL,
	`masthead_slug` varchar(160) NOT NULL,
	`region` varchar(120) NOT NULL,
	`edition_date` date NOT NULL,
	`kind` enum('open','download') NOT NULL,
	`created_at` datetime NOT NULL,
	CONSTRAINT `reading_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` int AUTO_INCREMENT NOT NULL,
	`email` varchar(254) NOT NULL,
	`google_sub` varchar(255),
	`name` varchar(200) NOT NULL DEFAULT '',
	`picture_url` varchar(2048),
	`status` enum('pending','approved','blocked') NOT NULL DEFAULT 'pending',
	`role` enum('user','admin') NOT NULL DEFAULT 'user',
	`session_version` int NOT NULL DEFAULT 1,
	`created_at` datetime NOT NULL,
	`approved_at` datetime,
	`approved_by` int,
	`last_login_at` datetime,
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_email_uq` UNIQUE(`email`),
	CONSTRAINT `users_google_sub_uq` UNIQUE(`google_sub`)
);
--> statement-breakpoint
ALTER TABLE `reading_events` ADD CONSTRAINT `reading_events_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `users` ADD CONSTRAINT `users_approved_by_users_id_fk` FOREIGN KEY (`approved_by`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `reading_events_user_created_idx` ON `reading_events` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `reading_events_masthead_created_idx` ON `reading_events` (`masthead_slug`,`created_at`);--> statement-breakpoint
CREATE INDEX `reading_events_created_idx` ON `reading_events` (`created_at`);