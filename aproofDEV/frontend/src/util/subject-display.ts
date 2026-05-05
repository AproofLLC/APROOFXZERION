import type { Subject } from "../api/types";
import { userFacingSubjectType } from "../constants/subject-type-display";

export function subjectDisplayLabel(s: Pick<Subject, "display_name" | "external_key" | "subject_id">): string {
  const dn = s.display_name?.trim();
  if (dn) return dn;
  const ek = s.external_key?.trim();
  if (ek) return ek;
  return s.subject_id;
}

/**
 * Primary headline for a subject when display_name / external_key are absent — avoids leading with a bare UUID.
 */
export function subjectPrimaryLabel(
  s: Pick<Subject, "display_name" | "external_key" | "subject_id" | "subject_type">,
): string {
  const base = subjectDisplayLabel(s);
  if (base !== s.subject_id) return base;
  const id = s.subject_id;
  const tail = id.length > 10 ? `…${id.slice(-8)}` : id;
  return `${userFacingSubjectType(s.subject_type)} · ${tail}`;
}
