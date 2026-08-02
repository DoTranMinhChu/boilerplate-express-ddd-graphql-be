import * as dotenv from 'dotenv';
import * as path from 'path';

// Load .env file
dotenv.config({ path: path.join(__dirname, '../../.env') });

/**
 * Required env vars — the app refuses to start if any of these are missing
 * or empty. No insecure defaults (e.g. a hardcoded JWT secret) are provided;
 * fail fast at startup instead of silently running with weak configuration.
 */
const REQUIRED_ENV_VARS = [
    'JWT_SECRET',
    'DB_HOST',
    'DB_PORT',
    'DB_USERNAME',
    'DB_DATABASE',
] as const;

function validateRequiredEnv(): void {
    const missing = REQUIRED_ENV_VARS.filter((key) => {
        const value = process.env[key];
        return value === undefined || value.trim().length === 0;
    });

    if (missing.length > 0) {
        throw new Error(
            `[env.config] Missing required environment variable(s): ${missing.join(', ')}. ` +
            `Copy .env.example to .env and fill in real values before starting the server.`,
        );
    }
}

validateRequiredEnv();

export const ENV_CONFIG = {
    NODE_ENV: process.env.NODE_ENV || 'development',
    PORT: parseInt(process.env.PORT || '3000', 10),
    APP_URL: process.env.APP_URL || 'http://localhost:3000',

    DB: {
        HOST: process.env.DB_HOST as string,
        PORT: parseInt(process.env.DB_PORT as string, 10),
        USERNAME: process.env.DB_USERNAME as string,
        PASSWORD: process.env.DB_PASSWORD || '',
        DATABASE: process.env.DB_DATABASE as string,
    },

    AUTH: {
        JWT_SECRET: process.env.JWT_SECRET as string,
        JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',
    },

    S3: {
        URL: process.env.S3_URL || 'http://localhost:3000',
        CDN_DOMAIN: process.env.CDN_DOMAIN || 'http://localhost:3000',
    },

    isDev: process.env.NODE_ENV === 'development',
    isProd: process.env.NODE_ENV === 'production',
};
