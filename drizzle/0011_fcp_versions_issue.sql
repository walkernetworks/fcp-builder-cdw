CREATE TABLE `fcpConsumptionEntries` (
	`id` int AUTO_INCREMENT NOT NULL,
	`engagementId` int NOT NULL,
	`asOf` date NOT NULL,
	`consumedHours` decimal(10,2) NOT NULL,
	`source` enum('manual','salesforce') NOT NULL DEFAULT 'manual',
	`externalId` varchar(128),
	`note` text,
	`enteredByUserId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `fcpConsumptionEntries_id` PRIMARY KEY(`id`),
	CONSTRAINT `fcp_consumption_external_uq` UNIQUE(`engagementId`,`source`,`externalId`)
);
--> statement-breakpoint
ALTER TABLE `fcpVersions` MODIFY COLUMN `reason` enum('manual','submitted','export','restore','decision','issued') NOT NULL;--> statement-breakpoint
ALTER TABLE `fcpVersions` ADD `issueNumber` int;--> statement-breakpoint
ALTER TABLE `fcpVersions` ADD `status` enum('issued','superseded');--> statement-breakpoint
ALTER TABLE `fcpVersions` ADD `basedOnVersionId` int;--> statement-breakpoint
ALTER TABLE `fcpVersions` ADD `effortSnapshot` json;--> statement-breakpoint
ALTER TABLE `fcpVersions` ADD `renderedHtml` mediumtext;--> statement-breakpoint
ALTER TABLE `fcpVersions` ADD `renderHash` varchar(64);--> statement-breakpoint
ALTER TABLE `fcpVersions` ADD `revisionNote` text;--> statement-breakpoint
ALTER TABLE `fcpVersions` ADD `changeSummary` json;--> statement-breakpoint
ALTER TABLE `fcpVersions` ADD `issuedAt` timestamp;--> statement-breakpoint
ALTER TABLE `fcpVersions` ADD `issuedByUserId` int;--> statement-breakpoint
ALTER TABLE `fcpVersions` ADD `broadcomApprovedOn` date;--> statement-breakpoint
ALTER TABLE `fcpVersions` ADD `broadcomApprovedByUserId` int;--> statement-breakpoint
ALTER TABLE `fcpVersions` ADD `broadcomApprovalNote` text;--> statement-breakpoint
ALTER TABLE `fcpVersions` ADD `customerApprovedOn` date;--> statement-breakpoint
ALTER TABLE `fcpVersions` ADD `customerApprovedByUserId` int;--> statement-breakpoint
ALTER TABLE `fcpVersions` ADD `customerApprovalNote` text;--> statement-breakpoint
ALTER TABLE `fcpVersions` ADD CONSTRAINT `fcp_versions_issue_uq` UNIQUE(`engagementId`,`issueNumber`);--> statement-breakpoint
ALTER TABLE `fcpConsumptionEntries` ADD CONSTRAINT `fcpConsumptionEntries_engagementId_engagements_id_fk` FOREIGN KEY (`engagementId`) REFERENCES `engagements`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `fcpConsumptionEntries` ADD CONSTRAINT `fcpConsumptionEntries_enteredByUserId_users_id_fk` FOREIGN KEY (`enteredByUserId`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `fcp_consumption_engagement_idx` ON `fcpConsumptionEntries` (`engagementId`,`asOf`,`id`);--> statement-breakpoint
ALTER TABLE `fcpVersions` ADD CONSTRAINT `fcpVersions_basedOnVersionId_fcpVersions_id_fk` FOREIGN KEY (`basedOnVersionId`) REFERENCES `fcpVersions`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `fcpVersions` ADD CONSTRAINT `fcpVersions_issuedByUserId_users_id_fk` FOREIGN KEY (`issuedByUserId`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `fcpVersions` ADD CONSTRAINT `fcpVersions_broadcomApprovedByUserId_users_id_fk` FOREIGN KEY (`broadcomApprovedByUserId`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `fcpVersions` ADD CONSTRAINT `fcpVersions_customerApprovedByUserId_users_id_fk` FOREIGN KEY (`customerApprovedByUserId`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;