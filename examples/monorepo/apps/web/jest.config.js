export default {
  testEnvironment: 'node',
  roots: ['<rootDir>/src/jest'],
  testMatch: ['**/*.spec.ts'],
  testTimeout: 60_000,
  // JSON report consumed by the e2e workflow
};
