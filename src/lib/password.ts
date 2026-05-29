import { createHash, randomBytes, timingSafeEqual } from "crypto";

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = createHash("sha256").update(`${salt}:${password}`).digest("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string) {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const candidate = createHash("sha256").update(`${salt}:${password}`).digest("hex");
  return timingSafeEqual(Buffer.from(hash), Buffer.from(candidate));
}
