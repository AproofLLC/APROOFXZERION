/**
 * Minimal globals for Vitest-style tests when the editor runs before `npm install`,
 * or when `vitest` package resolution fails. Runtime still requires `vitest` (see package.json).
 */
export {};

type VitestExpect = (actual: unknown) => {
  toBe(expected: unknown): void;
  toEqual(expected: unknown): void;
  toMatch(pattern: RegExp | string): void;
  toBeDefined(): void;
  toBeUndefined(): void;
  not: { toBe(expected: unknown): void };
};

declare global {
  const describe: (name: string, fn: () => void | Promise<void>) => void;
  const it: (name: string, fn: () => void | Promise<void>) => void;
  const expect: VitestExpect;
}
