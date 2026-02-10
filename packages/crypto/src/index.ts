import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // GCM standard: 96 bits

export interface EncryptedData {
  iv: string;      // base64 encoded
  authTag: string; // base64 encoded
  data: string;    // base64 encoded
}

export interface Credentials {
  username: string;
  password: string;
  targetUrl?: string;
}

function getEncryptionKey(): Buffer {
  const key = process.env.CREDENTIALS_ENCRYPTION_KEY;
  if (!key) {
    throw new Error('CREDENTIALS_ENCRYPTION_KEY environment variable is not set');
  }
  const keyBuffer = Buffer.from(key, 'base64');
  if (keyBuffer.length !== 32) {
    throw new Error('CREDENTIALS_ENCRYPTION_KEY must be 32 bytes (256 bits) encoded as base64');
  }
  return keyBuffer;
}

export function encrypt(plaintext: string): EncryptedData {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);

  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final()
  ]);
  const authTag = cipher.getAuthTag();

  return {
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
    data: encrypted.toString('base64')
  };
}

export function decrypt(encryptedData: EncryptedData): string {
  const key = getEncryptionKey();
  const iv = Buffer.from(encryptedData.iv, 'base64');
  const authTag = Buffer.from(encryptedData.authTag, 'base64');
  const encrypted = Buffer.from(encryptedData.data, 'base64');

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final()
  ]);

  return decrypted.toString('utf8');
}

export function encryptCredentials(credentials: Credentials): EncryptedData {
  return encrypt(JSON.stringify(credentials));
}

export function decryptCredentials(encryptedData: EncryptedData): Credentials {
  const decrypted = decrypt(encryptedData);
  return JSON.parse(decrypted) as Credentials;
}

export function isEncryptedFormat(data: unknown): data is EncryptedData {
  return (
    typeof data === 'object' &&
    data !== null &&
    'iv' in data &&
    'authTag' in data &&
    'data' in data &&
    typeof (data as EncryptedData).iv === 'string' &&
    typeof (data as EncryptedData).authTag === 'string' &&
    typeof (data as EncryptedData).data === 'string'
  );
}
