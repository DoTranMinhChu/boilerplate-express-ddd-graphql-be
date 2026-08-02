// src/test/jest.setup.ts
//
// A handful of core modules (auth.service.ts, crypto.util.ts, env.config.ts)
// intentionally throw at import time if required secrets/DB env vars are
// missing (fail-fast instead of an insecure default — see security notes in
// the README). Tests that import those modules (even transitively) need
// *some* value present, so we seed harmless test-only defaults here before
// any test file runs. Real values still come from .env / the environment in
// dev/prod — this file only fills gaps for the Jest process.
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-only-jwt-secret-not-for-production';
process.env.JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
process.env.ENCRYPTION_SECRET = process.env.ENCRYPTION_SECRET || 'test-only-encryption-secret-not-for-production';
process.env.DB_HOST = process.env.DB_HOST || 'localhost';
process.env.DB_PORT = process.env.DB_PORT || '5432';
process.env.DB_USERNAME = process.env.DB_USERNAME || 'test';
process.env.DB_PASSWORD = process.env.DB_PASSWORD ?? 'test';
process.env.DB_DATABASE = process.env.DB_DATABASE || 'test';
