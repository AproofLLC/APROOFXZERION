import { deterministicUuidFromSeed } from "../pipeline/artifact-identity.js";

/** Stable UUIDs for sandbox templates: same (environment, template, part) → same id across replays. */
export function sandboxScopedUuid(environmentId: string, template: string, part: string): string {
  return deterministicUuidFromSeed(`aproof.sandbox|${environmentId}|${template}|${part}`);
}
