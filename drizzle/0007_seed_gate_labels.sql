-- Seeds the gate display labels (shared/vsaFields.ts GATE_DATES) into app_settings. INSERT IGNORE keeps any label an
-- admin has already saved. server/appSettings.test.ts checks that these match the code.
INSERT IGNORE INTO `app_settings` (`key`, `value`) VALUES
	('gate_label.serSubmittedOn', JSON_QUOTE('SER submitted')),
	('gate_label.serApprovedOn', JSON_QUOTE('Broadcom partner approval')),
	('gate_label.fcpDraftCreatedOn', JSON_QUOTE('FCP draft created')),
	('gate_label.fcpSubmittedOn', JSON_QUOTE('FCP submitted')),
	('gate_label.fcpBroadcomAcceptedOn', JSON_QUOTE('FCP Broadcom acceptance')),
	('gate_label.fcpCustomerAcceptedOn', JSON_QUOTE('FCP customer acceptance')),
	('gate_label.workPlanSentOn', JSON_QUOTE('Work plan sent')),
	('gate_label.workPlanAcceptedOn', JSON_QUOTE('Work plan accepted')),
	('gate_label.ikomOn', JSON_QUOTE('Internal kickoff (IKOM)')),
	('gate_label.raReceivedOn', JSON_QUOTE('RA received')),
	('gate_label.workAuthReceivedOn', JSON_QUOTE('Work authorization received')),
	('gate_label.poReceivedOn', JSON_QUOTE('PO received')),
	('gate_label.ckomOn', JSON_QUOTE('Customer kickoff (CKOM)')),
	('gate_label.projectStartOn', JSON_QUOTE('Project start')),
	('gate_label.estimatedCloseOn', JSON_QUOTE('Estimated close')),
	('gate_label.completedOn', JSON_QUOTE('Completed'));
