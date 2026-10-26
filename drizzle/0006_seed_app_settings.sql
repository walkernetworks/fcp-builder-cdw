-- Seeds app_settings from the code defaults in shared/appSettings.ts (the constants in shared/vsaStage.ts and
-- shared/vsaDashboard.ts). INSERT IGNORE keeps any value an admin has already saved. server/appSettings.test.ts checks
-- that these match the code.
INSERT IGNORE INTO `app_settings` (`key`, `value`) VALUES
	('stale_after_days.intake', CAST('7' AS JSON)),
	('stale_after_days.broadcom_request', CAST('14' AS JSON)),
	('stale_after_days.discovery', CAST('21' AS JSON)),
	('stale_after_days.fcp_draft', CAST('21' AS JSON)),
	('stale_after_days.broadcom_approval', CAST('14' AS JSON)),
	('stale_after_days.customer_approval', CAST('21' AS JSON)),
	('stale_after_days.ra_staffing', CAST('14' AS JSON)),
	('stale_after_days.kickoff', CAST('14' AS JSON)),
	('stale_after_days.paused', CAST('60' AS JSON)),
	('work_plan_stale_days', CAST('14' AS JSON)),
	('expiry_band_days.d30', CAST('30' AS JSON)),
	('expiry_band_days.d60', CAST('60' AS JSON)),
	('expiry_band_days.d90', CAST('90' AS JSON)),
	('expiry_band_days.d180', CAST('180' AS JSON));
