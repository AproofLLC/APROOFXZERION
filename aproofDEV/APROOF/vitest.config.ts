import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["src/**/*.test.ts", "e2e/**/*.e2e.test.ts"],
    setupFiles: ["./vitest-setup-env.ts"],
  },
});
