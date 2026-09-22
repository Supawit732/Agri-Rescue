/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  clearMocks: true,
  collectCoverageFrom: ['src/domain/**/*.ts'],
  coverageThreshold: {
    'src/domain/': {
      branches: 90,
      functions: 90,
      lines: 90,
      statements: 90,
    },
  },
};
