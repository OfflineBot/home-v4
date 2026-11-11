import { api } from "./api";
import type { ArchiveInfo, ArchiveListing } from "./files";

const defaultRetention = 90;

export async function readArchive(token: string): Promise<ArchiveListing | null> {
  const res = await api("/api/files/archive", { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) return null;
  const data = (await res.json().catch(() => null)) as Partial<ArchiveListing> | null;
  if (!data || !Array.isArray(data.items)) return null;
  return { retention_days: data.retention_days ?? defaultRetention, items: data.items };
}

export async function archiveInfo(token: string): Promise<ArchiveInfo> {
  const archive = await readArchive(token);
  return archive
    ? { supported: true, count: archive.items.length, retention: archive.retention_days }
    : { supported: false, count: 0, retention: defaultRetention };
}
