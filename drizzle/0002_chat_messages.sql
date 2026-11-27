CREATE TABLE `messages` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`reader_id` int NOT NULL,
	`direction` enum('in','out') NOT NULL,
	`sender_user_id` int,
	`sender_local_username` varchar(64),
	`body` varchar(2000) NOT NULL,
	`created_at` datetime NOT NULL,
	`read_at` datetime,
	CONSTRAINT `messages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `messages` ADD CONSTRAINT `messages_reader_id_users_id_fk` FOREIGN KEY (`reader_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `messages` ADD CONSTRAINT `messages_sender_user_id_users_id_fk` FOREIGN KEY (`sender_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `messages_reader_idx` ON `messages` (`reader_id`,`id`);--> statement-breakpoint
CREATE INDEX `messages_unread_idx` ON `messages` (`direction`,`read_at`);--> statement-breakpoint
CREATE INDEX `messages_created_idx` ON `messages` (`created_at`);