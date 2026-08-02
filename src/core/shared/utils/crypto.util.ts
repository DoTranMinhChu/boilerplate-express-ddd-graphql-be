import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

const ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 16;

// No insecure default fallback — fail fast at startup if ENCRYPTION_SECRET is
// missing/empty rather than silently encrypting with a well-known key.
const ENCRYPTION_SECRET = process.env.ENCRYPTION_SECRET;
if (!ENCRYPTION_SECRET || ENCRYPTION_SECRET.trim().length === 0) {
    throw new Error(
        '[crypto.util] Missing required environment variable ENCRYPTION_SECRET. ' +
        'Set ENCRYPTION_SECRET to a strong random value before starting the server.',
    );
}

function getKey(): Buffer {
    // scrypt derives a 32-byte key from any-length secret
    return scryptSync(ENCRYPTION_SECRET as string, 'app-encryption-salt', 32);
}

export function encrypt(plaintext: string): string {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, getKey(), iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    return `${iv.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decrypt(ciphertext: string): string {
    const [ivHex, encryptedHex] = ciphertext.split(':');
    if (!ivHex || !encryptedHex) throw new Error('Invalid encrypted value format');
    const iv = Buffer.from(ivHex, 'hex');
    const encrypted = Buffer.from(encryptedHex, 'hex');
    const decipher = createDecipheriv(ALGORITHM, getKey(), iv);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

export function maskSecret(value: string): string {
    if (value.length <= 8) return '****';
    return `${value.slice(0, 4)}****${value.slice(-4)}`;
}
