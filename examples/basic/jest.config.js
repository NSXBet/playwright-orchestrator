export default {
  testEnvironment: 'node',
  roots: ['<rootDir>/jest-tests'],
  testMatch: ['**/*.spec.ts'],
  // Duration-controlled tests (up to 8s); timeout headroom for CI jitter.
  testTimeout: 30_000,
};