/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: "node",
  roots: ["<rootDir>/tests"],
  testMatch: ["**/*.test.ts"],
  transform: { "^.+\\.ts$": ["@swc/jest"] },
  clearMocks: true,
  restoreMocks: true,
  collectCoverageFrom: [
    "src/**/*.ts",
    // Entry point: only starts the server and wires signal handlers.
    "!src/server.ts",
  ],
  coverageReporters: ["text", "text-summary", "lcov"],
};
