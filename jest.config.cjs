module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  testMatch: ["**/tests/**/*.test.ts"],
  moduleNameMapper: {
    "^vscode$": "<rootDir>/tests/__mocks__/vscode.ts",
    "^spessasynth_core$": "<rootDir>/tests/__mocks__/spessasynth_core.ts",
  },
};
