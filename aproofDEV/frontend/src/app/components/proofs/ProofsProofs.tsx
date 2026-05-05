import { ProofsProofsList } from "./ProofsProofsList";

export function ProofsProofs({
  subjectId,
  shellResetEpoch = 0,
  demoMode = false,
  demoRail = "system",
}: {
  subjectId: string;
  /** Bumped after demo sandbox actions to drop stale proof detail selection. */
  shellResetEpoch?: number;
  demoMode?: boolean;
  demoRail?: string;
}) {
  return (
    <ProofsProofsList
      subjectId={subjectId}
      shellResetEpoch={shellResetEpoch}
      demoMode={demoMode}
      demoRail={demoRail}
    />
  );
}
