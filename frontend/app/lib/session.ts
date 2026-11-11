import { createCookie, redirect } from "react-router";

export const cookieName = "session";

export const sessionCookie = createCookie(cookieName, {
  path: "/",
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.SESSION_COOKIE_SECURE !== "false",
});

export function clearedSession() {
  return sessionCookie.serialize("", { maxAge: 0 });
}

// must go through the cookie helper: serialize() json-encodes and base64s the
// value, so reading the raw cookie would hand the backend an unusable token
export async function readSession(cookieHeader: string | null) {
  const value = await sessionCookie.parse(cookieHeader);

  return typeof value === "string" && value !== "" ? value : null;
}

export async function requireToken(request: Request) {
  const token = await readSession(request.headers.get("Cookie"));

  if (!token) {
    throw redirect("/login");
  }
  return token;
}
