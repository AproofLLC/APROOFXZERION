export type RetrievalIntegrityBaseline = {
  type: "retrieval_integrity_v1";
  expected_sources: string[];
  min_sources: number;
};

export type RetrievalIntegrityEvent = {
  retrieved_sources: string[];
};

export type RetrievalIntegrityEvaluation = {
  angle: "retrieval_integrity";
  applicable: true;
  status: "conformant" | "violated";
  reason_code: string | null;
  summary: string | null;
  evidence_refs: string[];
};

export function evaluateRetrievalIntegrity(input: {
  baseline: {
    type?: unknown;
    expected_sources?: unknown;
    min_sources?: unknown;
  };
  canonicalEvent: {
    retrieved_sources?: unknown;
  };
}): RetrievalIntegrityEvaluation {
  const { baseline, canonicalEvent } = input;

  if (
    baseline.type !== "retrieval_integrity_v1" ||
    !Array.isArray(baseline.expected_sources) ||
    !baseline.expected_sources.every((s) => typeof s === "string") ||
    typeof baseline.min_sources !== "number"
  ) {
    return {
      angle: "retrieval_integrity",
      applicable: true,
      status: "violated",
      reason_code: "RETRIEVAL_BASELINE_INVALID",
      summary: "Retrieval baseline invalid",
      evidence_refs: [],
    };
  }

  const retrieved = canonicalEvent.retrieved_sources;
  if (!Array.isArray(retrieved) || !retrieved.every((s) => typeof s === "string") || retrieved.length === 0) {
    return {
      angle: "retrieval_integrity",
      applicable: true,
      status: "violated",
      reason_code: "RETRIEVAL_NO_SOURCES",
      summary: "No retrieval sources provided",
      evidence_refs: [],
    };
  }

  if (retrieved.length < baseline.min_sources) {
    return {
      angle: "retrieval_integrity",
      applicable: true,
      status: "violated",
      reason_code: "RETRIEVAL_TOO_FEW_SOURCES",
      summary: "Insufficient sources retrieved",
      evidence_refs: [],
    };
  }

  const retrievedSet = new Set(retrieved);
  const expectedMissing = baseline.expected_sources.some((src) => !retrievedSet.has(src));
  if (expectedMissing) {
    return {
      angle: "retrieval_integrity",
      applicable: true,
      status: "violated",
      reason_code: "RETRIEVAL_EXPECTED_SOURCE_MISSING",
      summary: "Expected source missing",
      evidence_refs: [],
    };
  }

  return {
    angle: "retrieval_integrity",
    applicable: true,
    status: "conformant",
    reason_code: null,
    summary: "Retrieval integrity verified",
    evidence_refs: [],
  };
}
