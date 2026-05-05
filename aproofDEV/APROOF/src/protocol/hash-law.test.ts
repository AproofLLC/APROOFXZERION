import { describe, expect, it } from "vitest";
import { normalizeCanonicalEventType } from "./event-aliases.js";
import { canonicalHashFields, logicalHashFields, rawPayloadHashFromPayload, stableStringify } from "./event-hashing.js";

describe("hash law invariants", () => {
  it("applies alias normalization before hashing", () => {
    const base = {
      organization_id: "o1",
      environment_id: "e1",
      subject_id: "s1",
      source_type_key: "k1",
      event_lineage_id: "l1",
      event_version: 1,
      trace_id: "t1",
      occurred_at: "2026-04-06T12:00:00.000Z",
      payload: { a: 1 },
    };
    const aliasInput = {
      ...base,
      canonical_event_type: normalizeCanonicalEventType("access_token_used"),
    };
    const canonicalInput = {
      ...base,
      canonical_event_type: "identity_access_checked",
    };
    expect(rawPayloadHashFromPayload(aliasInput)).toBe(rawPayloadHashFromPayload(canonicalInput));
  });

  it("treats sorted object keys as equivalent", () => {
    const a = { z: 1, a: { c: 3, b: 2 } };
    const b = { a: { b: 2, c: 3 }, z: 1 };
    expect(stableStringify(a)).toBe(stableStringify(b));
    expect(rawPayloadHashFromPayload(a)).toBe(rawPayloadHashFromPayload(b));
  });

  it("distinguishes null vs omitted", () => {
    const withNull = { a: null };
    const omitted = {};
    expect(stableStringify(withNull)).not.toBe(stableStringify(omitted));
    expect(rawPayloadHashFromPayload(withNull)).not.toBe(rawPayloadHashFromPayload(omitted));
  });

  it("is sensitive to array order", () => {
    const a = { x: [1, 2, 3] };
    const b = { x: [3, 2, 1] };
    expect(rawPayloadHashFromPayload(a)).not.toBe(rawPayloadHashFromPayload(b));
  });

  it("normalizes Date timestamps to stable ISO strings", () => {
    const d = new Date("2026-04-06T12:00:00.000Z");
    expect(stableStringify({ ts: d })).toBe(stableStringify({ ts: "2026-04-06T12:00:00.000Z" }));
  });

  it("normalizes canonical event type before canonical hash", () => {
    const common = {
      event_id: "11111111-1111-1111-1111-111111111111",
      trace_id: "trace",
      subject_id: "22222222-2222-2222-2222-222222222222",
      occurred_at: "2026-04-06T12:00:00.000Z",
    };
    const aliasHash = canonicalHashFields({
      ...common,
      event_type: normalizeCanonicalEventType("access_token_used"),
    });
    const canonicalHash = canonicalHashFields({
      ...common,
      event_type: "identity_access_checked",
    });
    expect(aliasHash).toBe(canonicalHash);
  });

  it("keeps same logical event hash stable", () => {
    const h1 = canonicalHashFields({
      event_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      trace_id: "trace-a",
      subject_id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
      event_type: "action_completed",
      occurred_at: "2026-04-06T12:00:00.000Z",
    });
    const h2 = canonicalHashFields({
      event_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      trace_id: "trace-a",
      subject_id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
      event_type: "action_completed",
      occurred_at: "2026-04-06T12:00:00.000Z",
    });
    expect(h1).toBe(h2);
  });

  it("changes canonical hash when logical hash field changes", () => {
    const h1 = canonicalHashFields({
      event_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      trace_id: "trace-a",
      subject_id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
      event_type: "action_completed",
      occurred_at: "2026-04-06T12:00:00.000Z",
    });
    const h2 = canonicalHashFields({
      event_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      trace_id: "trace-b",
      subject_id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
      event_type: "action_completed",
      occurred_at: "2026-04-06T12:00:00.000Z",
    });
    expect(h1).not.toBe(h2);
  });

  it("same content with different event_id yields same logical_hash", () => {
    const l1 = logicalHashFields({
      subject_id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
      event_type: "action_completed",
      payload: { state: "same" },
    });
    const l2 = logicalHashFields({
      subject_id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
      event_type: "action_completed",
      payload: { state: "same" },
    });
    expect(l1).toBe(l2);
  });

  it("different content yields different logical_hash", () => {
    const l1 = logicalHashFields({
      subject_id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
      event_type: "action_completed",
      payload: { state: "same" },
    });
    const l2 = logicalHashFields({
      subject_id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
      event_type: "action_completed",
      payload: { state: "different" },
    });
    expect(l1).not.toBe(l2);
  });
});
