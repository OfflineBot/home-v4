const saltPrefix = "home-v4:";
const rounds = 600000;
const keyBits = 256;

export const minPasswordLength = 8;

export function normalizeName(name: string) {
  return name.trim().toLowerCase();
}

export async function hashPassword(
  name: string,
  password: string,
): Promise<string> {
  const encoder = new TextEncoder();

  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );

  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: encoder.encode(saltPrefix + normalizeName(name)),
      iterations: rounds,
    },
    key,
    keyBits,
  );

  return Array.from(new Uint8Array(bits))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
