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
  coverageThreshold: {
    global: {
      statements: 80,
    },
  },
}

export default config
