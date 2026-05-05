/// <reference path="../../vitest-test-globals.d.ts" />
import * as schema from "./index.js";

describe("schema exports", () => {
  it("exports core pipeline tables", () => {
    expect(schema.organizations).toBeDefined();
    expect(schema.rawEvents).toBeDefined();
    expect(schema.canonicalEvents).toBeDefined();
    expect(schema.proofUnits).toBeDefined();
    expect(schema.failureLocatorRecords).toBeDefined();
    expect(schema.anchorBatches).toBeDefined();
    expect(schema.anchorBatchItems).toBeDefined();
    expect(schema.subjectUserLogs).toBeDefined();
  });
});
