CREATE TABLE `engagements` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ownerId` int NOT NULL,
	`title` varchar(240) NOT NULL,
	`customerName` varchar(240) NOT NULL DEFAULT 'Untitled customer',
	`customerShortName` varchar(64) NOT NULL DEFAULT 'TBD',
	`status` enum('draft','ready','archived') NOT NULL DEFAULT 'draft',
	`data` json NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `engagements_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `openId` varchar(191) NOT NULL;--> statement-breakpoint
CREATE INDEX `engagements_owner_updated_idx` ON `engagements` (`ownerId`,`updatedAt`);