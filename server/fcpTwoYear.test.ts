import { describe, expect, it } from "vitest";
import { problemsAddressedByFollowOn } from "./fcpTwoYear";
import { shortBarLabel } from "./timelineLabels";
import { acmeHealthReconciled, FIXTURE_TODAY } from "./fixtures/fcpFixtures";
import { scopedEffortForDocument } from "./rateCard";

const followOn = () => {
  const document = acmeHealthReconciled();
  return { document, rows: scopedEffortForDocument(document, FIXTURE_TODAY).workPackages.filter(row => row.followOn && row.followOn.total > 0) };
};

describe("the problem the follow-on work addresses", () => {
  it("quotes a problem only when what addresses it names a follow-on package", () => {
    const { document, rows } = followOn();
    document.report.problems = [{ problem: "Manual recovery of 330 powered-on VMs.", addressedBy: "Recovery Services Build picks the orchestration so DR is executable under pressure" }];
    expect(problemsAddressedByFollowOn(document, rows)).toEqual(["Manual recovery of 330 powered-on VMs"]);
  });

  it("does not match on a word the two merely share, such as design or platform", () => {
    const { document, rows } = followOn();
    document.report.problems = [
      { problem: "No agreed design standard", addressedBy: "the recovery design and the platform design" },
      { problem: "Platform sprawl", addressedBy: "a platform build with a design review" },
    ];
    expect(problemsAddressedByFollowOn(document, rows)).toEqual([]);
  });

  it("shortens the small-estate design package to Reference Design on the timeline", () => {
    expect(shortBarLabel("Reference Architecture Design")).toBe("Reference Design");
    expect(shortBarLabel("Month 2: Reference Architecture Design")).toBe("Reference Design");
  });
});
