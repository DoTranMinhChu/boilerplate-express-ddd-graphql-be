// jest.config.js
/** @type {import('jest').Config} */
module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    rootDir: 'src',
    testMatch: ['**/__tests__/**/*.test.ts'],
    setupFiles: ['<rootDir>/test/jest.setup.ts'],
    moduleNameMapper: {
        // Keep in sync with tsconfig.json's "paths"
        '^@/core/(.*)$': '<rootDir>/core/$1',
        '^@core/(.*)$': '<rootDir>/core/$1',
        '^@/(.*)$': '<rootDir>/$1',
    },
    transform: {
        '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/../tsconfig.json' }],
    },
};
