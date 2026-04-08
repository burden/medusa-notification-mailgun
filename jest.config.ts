import type { Config } from "jest"

const config: Config = {
  preset: "ts-jest",
  testEnvironment: "node",
  rootDir: ".",
  testMatch: ["<rootDir>/src/**/*.test.ts"],
  moduleFileExtensions: ["ts", "js", "json"],
  transform: {
    "^.+\\.ts$": ["ts-jest", {
      diagnostics: { ignoreCodes: [151002] },
    }],
  },
  // Coverage threshold removed (TICKET-11): the previous 80% statements gate
  // never fired because `collectCoverage` was never enabled. Re-add both
  // together if/when coverage gating becomes a real CI requirement.
}

export default config
