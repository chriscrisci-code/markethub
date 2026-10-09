import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "crypto";

export type EncryptedPayload = {
  v: 1;
  ciphertext: string;
  iv: string;
  tag: string;
};

export type EtsyTokenBundle = {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  scope?: string;
};

function encryptionKey(): Buffer {
  const raw = process.env.ETSY_TOKEN_KEY;
  if (!raw) {
    throw new Error("ETSY_TOKEN_KEY is not set.");
  }

  const decoded = Buffer.from(raw, "base64");
  if (decoded.length === 32) {
    return decoded;
  }

  return createHash("sha256").update(raw).digest();
}

export function encryptJson(value: unknown): EncryptedPayload {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(value), "utf8"),
    cipher.final(),
  ]);

  return {
    v: 1,
    ciphertext: ciphertext.toString("base64url"),
    iv: iv.toString("base64url"),
    tag: cipher.getAuthTag().toString("base64url"),
  };
}

export function decryptJson<T>(payload: EncryptedPayload): T {
  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(payload.iv, "base64url")
  );
  decipher.setAuthTag(Buffer.from(payload.tag, "base64url"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(payload.ciphertext, "base64url")),
    decipher.final(),
  ]);
  return JSON.parse(plaintext.toString("utf8")) as T;
}

export function isEncryptedPayload(value: unknown): value is EncryptedPayload {
  if (!value || typeof value !== "object") return false;
  const payload = value as EncryptedPayload;
  return (
    payload.v === 1 &&
    typeof payload.ciphertext === "string" &&
    typeof payload.iv === "string" &&
    typeof payload.tag === "string"
  );
}
