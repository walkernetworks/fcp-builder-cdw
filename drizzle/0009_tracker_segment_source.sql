ALTER TABLE `engagements` ADD `segmentSource` enum('inferred_from_fcp');--> statement-breakpoint
-- Fills the tracker segment (engagements.segment, the single source of truth for the deal segment) from the FCP's
-- customer segment, only where the tracker has none, and marks each filled row 'inferred_from_fcp': the old FCP field
-- had no Strategic value, so a person reviews these. It never changes a tracker segment that is set, and never writes
-- the FCP document: the FCP's plan inputs are its own (docs/FCP-WORKSPACE.md §8.2). "public-sector" was saved by
-- older documents and reads as Corporate. An FCP with no segment ("unspecified" or absent) leaves the tracker empty.
UPDATE `engagements`
SET `segment` = CASE JSON_UNQUOTE(JSON_EXTRACT(`data`, '$.fields.customerSegment'))
		WHEN 'commercial' THEN 'commercial'
		ELSE 'corporate'
	END,
	`segmentSource` = 'inferred_from_fcp'
WHERE `segment` IS NULL
	AND JSON_UNQUOTE(JSON_EXTRACT(`data`, '$.fields.customerSegment')) IN ('commercial', 'corporate', 'public-sector');
