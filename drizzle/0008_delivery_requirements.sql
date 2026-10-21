ALTER TABLE `engagements` ADD `workPlanHours` int;--> statement-breakpoint
ALTER TABLE `engagements` ADD `poHours` int;--> statement-breakpoint
ALTER TABLE `engagements` ADD `fcpWaiverParty` enum('pm','broadcom');--> statement-breakpoint
ALTER TABLE `engagements` ADD `fcpWaiverBy` varchar(120);--> statement-breakpoint
ALTER TABLE `engagements` ADD `fcpWaivedOn` date;--> statement-breakpoint
ALTER TABLE `engagements` ADD `fcpWaiverSource` varchar(500);--> statement-breakpoint
ALTER TABLE `engagements` ADD `fcpWaiverRecordedByUserId` int;--> statement-breakpoint
ALTER TABLE `engagements` ADD CONSTRAINT `engagements_fcpWaiverRecordedByUserId_users_id_fk` FOREIGN KEY (`fcpWaiverRecordedByUserId`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;