ALTER TABLE `fcpVersions` MODIFY COLUMN `reason` enum('manual','submitted','export','restore','decision') NOT NULL;--> statement-breakpoint
ALTER TABLE `engagements` ADD `segmentReview` json;