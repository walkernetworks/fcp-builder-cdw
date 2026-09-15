import { buildAdoptionPlans, createDefaultDocument } from './shared/fcp';
for (const path of ['undecided','in-place','converge','import-workload-domain','greenfield','hybrid','design-only'] as const) {
  const doc=createDefaultDocument();
  Object.assign(doc.fields,{plannedProjectStart:'2026-09-14',plannedImplementationStart:'2027-03-01',targetComplete:'2027-12-31',entitlementStart:'2026-09-01',entitlementEnd:'2027-09-01',adoptionDetails:{...doc.fields.adoptionDetails,upgradePath:path},priorities:['operations','automation']});
  const plans=buildAdoptionPlans(doc.fields,doc.inventory);
  console.log('\nPATH',path);
  for(const lane of plans.adoptionTimeline.lanes){for(const bar of lane.bars) console.log(bar.startCol,bar.endCol,lane.workstreamType,bar.id,bar.label)}
}
