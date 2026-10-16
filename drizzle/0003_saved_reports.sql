CREATE TABLE `savedReports` (
	`id` int AUTO_INCREMENT NOT NULL,
	`workspaceId` int NOT NULL DEFAULT 1,
	`ownerId` int NOT NULL,
	`name` varchar(120) NOT NULL,
	`config` json NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `savedReports_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `savedReports` ADD CONSTRAINT `savedReports_workspaceId_workspaces_id_fk` FOREIGN KEY (`workspaceId`) REFERENCES `workspaces`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `savedReports` ADD CONSTRAINT `savedReports_ownerId_users_id_fk` FOREIGN KEY (`ownerId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `saved_reports_workspace_idx` ON `savedReports` (`workspaceId`,`name`);