import { api } from "./api";
import type { DHBWAccount, DHBWModule } from "./dhbw";

export async function isConnected(token: string, module: DHBWModule) {
  const res = await api("/api/connections/dhbw", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return false;

  const account = (await res.json()) as DHBWAccount;
  return account[module] === true;
}
