const hashPrefix = "home-v4";

export const minPasswordLength = 8;

export async function hashPassword(
  name: string,
  password: string,
): Promise<string> {
  const data = new TextEncoder().encode(`${hashPrefix}:${name}:${password}`);
  const digest = await crypto.subtle.digest("SHA-256", data);

  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
