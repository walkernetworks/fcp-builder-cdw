CREATE TABLE `fcpVersions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`engagementId` int NOT NULL,
	`versionNumber` int NOT NULL,
	`title` varchar(240) NOT NULL,
	`data` json NOT NULL,
	`dataHash` varchar(64) NOT NULL,
	`label` varchar(160) NOT NULL,
	`reason` enum('manual','submitted','export','restore') NOT NULL,
	`createdByUserId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `fcpVersions_id` PRIMARY KEY(`id`),
	CONSTRAINT `fcp_versions_number_uq` UNIQUE(`engagementId`,`versionNumber`)
);
--> statement-breakpoint
ALTER TABLE `fcpVersions` ADD CONSTRAINT `fcpVersions_engagementId_engagements_id_fk` FOREIGN KEY (`engagementId`) REFERENCES `engagements`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `fcpVersions` ADD CONSTRAINT `fcpVersions_createdByUserId_users_id_fk` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;