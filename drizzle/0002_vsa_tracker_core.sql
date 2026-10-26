CREATE TABLE `engagementAssignments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`engagementId` int NOT NULL,
	`role` enum('sales_rep','account_manager','presales','architect','pm','sr_consultant','broadcom_ad') NOT NULL,
	`userId` int,
	`displayName` varchar(240) NOT NULL,
	`email` varchar(320),
	`broadcomEmail` varchar(320),
	`createdByUserId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `engagementAssignments_id` PRIMARY KEY(`id`),
	CONSTRAINT `assignments_engagement_role_uq` UNIQUE(`engagementId`,`role`)
);
--> statement-breakpoint
CREATE TABLE `sourceChainItems` (
	`id` int AUTO_INCREMENT NOT NULL,
	`engagementId` int NOT NULL,
	`kind` enum('rvtools','discovery_notes','customer_brief','hardware_review','hours_source','broadcom_ser','other') NOT NULL,
	`label` varchar(240) NOT NULL,
	`required` boolean NOT NULL DEFAULT true,
	`status` enum('needed','requested','received','verified','waived') NOT NULL DEFAULT 'needed',
	`requestedOn` date,
	`receivedOn` date,
	`reference` varchar(1024),
	`note` text,
	`createdByUserId` int NOT NULL,
	`updatedByUserId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `sourceChainItems_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `stageEvents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`engagementId` int NOT NULL,
	`fromStage` enum('intake','broadcom_request','discovery','fcp_draft','broadcom_approval','customer_approval','ra_staffing','kickoff','in_delivery','complete','refused','paused','lost'),
	`toStage` enum('intake','broadcom_request','discovery','fcp_draft','broadcom_approval','customer_approval','ra_staffing','kickoff','in_delivery','complete','refused','paused','lost') NOT NULL,
	`effectiveOn` date NOT NULL,
	`recordedAt` timestamp NOT NULL DEFAULT (now()),
	`actorUserId` int,
	`source` enum('manual','import','system') NOT NULL,
	`note` text,
	CONSTRAINT `stageEvents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `workspaces` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(120) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `workspaces_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
-- Hand-added: workspace 1 must exist before the workspaceId foreign keys below.
INSERT INTO `workspaces` (`id`, `name`) VALUES (1, 'CDW VSA');--> statement-breakpoint
ALTER TABLE `engagements` ADD `workspaceId` int DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `engagements` ADD `salesforceCustomerId` varchar(32);--> statement-breakpoint
ALTER TABLE `engagements` ADD `salesforceOpportunityId` varchar(32);--> statement-breakpoint
ALTER TABLE `engagements` ADD `opportunityNumber` varchar(32);--> statement-breakpoint
ALTER TABLE `engagements` ADD `serNumber` varchar(32);--> statement-breakpoint
ALTER TABLE `engagements` ADD `intakeSource` enum('manual','sharepoint_import','intake_import') DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE `engagements` ADD `intakeSubmissionId` varchar(64);--> statement-breakpoint
ALTER TABLE `engagements` ADD `sharepointItemId` int;--> statement-breakpoint
ALTER TABLE `engagements` ADD `importSnapshot` json;--> statement-breakpoint
ALTER TABLE `engagements` ADD `lastImportedAt` timestamp;--> statement-breakpoint
ALTER TABLE `engagements` ADD `intakeAnswers` json;--> statement-breakpoint
ALTER TABLE `engagements` ADD `isFundingExtension` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `engagements` ADD `entitlementGroupId` int;--> statement-breakpoint
ALTER TABLE `engagements` ADD `segment` enum('corporate','strategic','commercial');--> statement-breakpoint
ALTER TABLE `engagements` ADD `program` enum('entitlement','extended_expert','bsas','cash_sow','government_entitlement','government_bsas');--> statement-breakpoint
ALTER TABLE `engagements` ADD `region` enum('west','east');--> statement-breakpoint
ALTER TABLE `engagements` ADD `customerState` varchar(64);--> statement-breakpoint
ALTER TABLE `engagements` ADD `entitlementInterest` enum('interested','not_interested','pending');--> statement-breakpoint
ALTER TABLE `engagements` ADD `stage` enum('intake','broadcom_request','discovery','fcp_draft','broadcom_approval','customer_approval','ra_staffing','kickoff','in_delivery','complete','refused','paused','lost') DEFAULT 'intake' NOT NULL;--> statement-breakpoint
ALTER TABLE `engagements` ADD `stageEnteredOn` date DEFAULT (curdate()) NOT NULL;--> statement-breakpoint
ALTER TABLE `engagements` ADD `waitingOn` enum('sales','customer','broadcom','cdw_internal');--> statement-breakpoint
ALTER TABLE `engagements` ADD `health` enum('green','yellow','red');--> statement-breakpoint
ALTER TABLE `engagements` ADD `riskAssessment` enum('not_submitted','submitted','standard_terms_acknowledged','not_applicable');--> statement-breakpoint
ALTER TABLE `engagements` ADD `raStatus` enum('not_needed','not_started','waiting_from_broadcom','sent_to_broadcom','resources_onboarding','in_flight','delivery_complete','cancelled');--> statement-breakpoint
ALTER TABLE `engagements` ADD `vcfAssessment` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `engagements` ADD `nextSteps` text;--> statement-breakpoint
ALTER TABLE `engagements` ADD `statusNotes` text;--> statement-breakpoint
ALTER TABLE `engagements` ADD `serSubmittedOn` date;--> statement-breakpoint
ALTER TABLE `engagements` ADD `serApprovedOn` date;--> statement-breakpoint
ALTER TABLE `engagements` ADD `fcpDraftCreatedOn` date;--> statement-breakpoint
ALTER TABLE `engagements` ADD `fcpSubmittedOn` date;--> statement-breakpoint
ALTER TABLE `engagements` ADD `fcpBroadcomAcceptedOn` date;--> statement-breakpoint
ALTER TABLE `engagements` ADD `fcpCustomerAcceptedOn` date;--> statement-breakpoint
ALTER TABLE `engagements` ADD `workPlanSentOn` date;--> statement-breakpoint
ALTER TABLE `engagements` ADD `workPlanAcceptedOn` date;--> statement-breakpoint
ALTER TABLE `engagements` ADD `ikomOn` date;--> statement-breakpoint
ALTER TABLE `engagements` ADD `raReceivedOn` date;--> statement-breakpoint
ALTER TABLE `engagements` ADD `workAuthReceivedOn` date;--> statement-breakpoint
ALTER TABLE `engagements` ADD `poReceivedOn` date;--> statement-breakpoint
ALTER TABLE `engagements` ADD `ckomOn` date;--> statement-breakpoint
ALTER TABLE `engagements` ADD `projectStartOn` date;--> statement-breakpoint
ALTER TABLE `engagements` ADD `estimatedCloseOn` date;--> statement-breakpoint
ALTER TABLE `engagements` ADD `completedOn` date;--> statement-breakpoint
ALTER TABLE `engagements` ADD `entitlementValue` decimal(14,2);--> statement-breakpoint
ALTER TABLE `engagements` ADD `estimatedDealValue` decimal(14,2);--> statement-breakpoint
ALTER TABLE `engagements` ADD `broadcomPo` varchar(64);--> statement-breakpoint
ALTER TABLE `engagements` ADD `termStart` date;--> statement-breakpoint
ALTER TABLE `engagements` ADD `termEnd` date;--> statement-breakpoint
ALTER TABLE `engagements` ADD `deliveryWindowEnd` date;--> statement-breakpoint
ALTER TABLE `engagements` ADD `coreCount` int;--> statement-breakpoint
ALTER TABLE `engagements` ADD `clientFolderUrl` varchar(1024);--> statement-breakpoint
ALTER TABLE `engagements` ADD `buildLockUserId` int;--> statement-breakpoint
ALTER TABLE `engagements` ADD `buildLockAt` timestamp;--> statement-breakpoint
ALTER TABLE `engagements` ADD `rowVersion` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `engagements` ADD `updatedByUserId` int;--> statement-breakpoint
ALTER TABLE `users` ADD `workspaceId` int DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `vsaRole` enum('sales','architect','presales','pm','leadership');--> statement-breakpoint
ALTER TABLE `engagements` ADD CONSTRAINT `engagements_sf_opportunity_uq` UNIQUE(`salesforceOpportunityId`);--> statement-breakpoint
ALTER TABLE `engagements` ADD CONSTRAINT `engagements_opportunity_number_uq` UNIQUE(`opportunityNumber`);--> statement-breakpoint
ALTER TABLE `engagements` ADD CONSTRAINT `engagements_sharepoint_item_uq` UNIQUE(`sharepointItemId`);--> statement-breakpoint
ALTER TABLE `engagements` ADD CONSTRAINT `engagements_intake_submission_uq` UNIQUE(`intakeSubmissionId`);--> statement-breakpoint
ALTER TABLE `engagementAssignments` ADD CONSTRAINT `engagementAssignments_engagementId_engagements_id_fk` FOREIGN KEY (`engagementId`) REFERENCES `engagements`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `engagementAssignments` ADD CONSTRAINT `engagementAssignments_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `engagementAssignments` ADD CONSTRAINT `engagementAssignments_createdByUserId_users_id_fk` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `sourceChainItems` ADD CONSTRAINT `sourceChainItems_engagementId_engagements_id_fk` FOREIGN KEY (`engagementId`) REFERENCES `engagements`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `sourceChainItems` ADD CONSTRAINT `sourceChainItems_createdByUserId_users_id_fk` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `sourceChainItems` ADD CONSTRAINT `sourceChainItems_updatedByUserId_users_id_fk` FOREIGN KEY (`updatedByUserId`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `stageEvents` ADD CONSTRAINT `stageEvents_engagementId_engagements_id_fk` FOREIGN KEY (`engagementId`) REFERENCES `engagements`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `stageEvents` ADD CONSTRAINT `stageEvents_actorUserId_users_id_fk` FOREIGN KEY (`actorUserId`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `assignments_user_role_idx` ON `engagementAssignments` (`userId`,`role`);--> statement-breakpoint
CREATE INDEX `source_chain_engagement_idx` ON `sourceChainItems` (`engagementId`,`kind`);--> statement-breakpoint
CREATE INDEX `stage_events_engagement_idx` ON `stageEvents` (`engagementId`,`effectiveOn`,`id`);--> statement-breakpoint
ALTER TABLE `engagements` ADD CONSTRAINT `engagements_workspaceId_workspaces_id_fk` FOREIGN KEY (`workspaceId`) REFERENCES `workspaces`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `engagements` ADD CONSTRAINT `engagements_buildLockUserId_users_id_fk` FOREIGN KEY (`buildLockUserId`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `engagements` ADD CONSTRAINT `engagements_updatedByUserId_users_id_fk` FOREIGN KEY (`updatedByUserId`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `users` ADD CONSTRAINT `users_workspaceId_workspaces_id_fk` FOREIGN KEY (`workspaceId`) REFERENCES `workspaces`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `engagements_sf_customer_idx` ON `engagements` (`salesforceCustomerId`);--> statement-breakpoint
CREATE INDEX `engagements_workspace_stage_idx` ON `engagements` (`workspaceId`,`stage`,`stageEnteredOn`);--> statement-breakpoint
CREATE INDEX `engagements_workspace_expiry_idx` ON `engagements` (`workspaceId`,`deliveryWindowEnd`);--> statement-breakpoint
CREATE INDEX `engagements_ser_idx` ON `engagements` (`serNumber`);--> statement-breakpoint
CREATE INDEX `engagements_entitlement_group_idx` ON `engagements` (`entitlementGroupId`);--> statement-breakpoint
-- Hand-added backfill (docs/VSA-TRACKER-DATA-MODEL.md section 9): existing FCPs enter the tracker in FCP Draft.
UPDATE `engagements` SET `stage` = 'fcp_draft', `stageEnteredOn` = DATE(`createdAt`);--> statement-breakpoint
INSERT INTO `stageEvents` (`engagementId`, `fromStage`, `toStage`, `effectiveOn`, `recordedAt`, `actorUserId`, `source`, `note`)
SELECT `id`, NULL, 'fcp_draft', DATE(`createdAt`), now(), NULL, 'system', 'Existing FCP at tracker migration' FROM `engagements`;
