import { createCookie } from "react-router";

export const sessionCookie = createCookie("session", {
  httpOnly: true,
  sameSite: "lax",
  path: "/",
  secure: process.env.SESSION_COOKIE_SECURE === "true",
});

export async function sessionToken(request: Request): Promise<string | null> {
  const token = await sessionCookie.parse(request.headers.get("Cookie"));
  return typeof token === "string" && token.length > 0 ? token : null;
}

export function clearedSession() {
  return sessionCookie.serialize("", { maxAge: 0 });
}
