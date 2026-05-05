/** Display order for multi-subject Demo Mode (matches backend `DEMO_SUBJECT_RAIL_ORDER`). */
export const DEMO_RAIL_OPTIONS = [
  { rail: "model", label: "Model" },
  { rail: "agent", label: "Agent" },
  { rail: "service", label: "Service" },
  { rail: "endpoint", label: "Endpoint" },
  { rail: "system", label: "System" },
] as const;

export type DemoRailId = (typeof DEMO_RAIL_OPTIONS)[number]["rail"];
