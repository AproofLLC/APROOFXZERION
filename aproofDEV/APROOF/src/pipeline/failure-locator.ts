import type { IntegrityAngle } from "../protocol/angle-applicability.js";

/** Spec §11: locator only for flagged|violated; no prediction/scoring language. */
export function buildFailureLocatorFields(input: {
  subjectId: string;
  host: string;
  angle: IntegrityAngle;
  inspectionPath: string;
  failureZone: string;
}) {
  return {
    failureZone: input.failureZone,
    subject: input.subjectId,
    host: input.host,
    angle: input.angle,
    inspectionPath: input.inspectionPath,
  };
}
