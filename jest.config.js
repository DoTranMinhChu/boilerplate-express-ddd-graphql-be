// jest.config.js
/** @type {import('jest').Config} */
module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    rootDir: 'src',
    // Test discovery also covers ../scripts (one-off migration scripts live at repo
    // root, sibling to src, not under it) — added for Task 18 (Canvas Editor v2).
    // rootDir stays 'src' so moduleNameMapper's <rootDir>-relative paths below are
    // untouched.
    roots: ['<rootDir>', '<rootDir>/../scripts'],
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
