import { useCallback, useState } from "react";
import type { Route } from "./+types/grades";
import { Stack } from "../components/block";
import { EmptySync } from "../components/empty-sync";
import { ModuleDetail } from "../components/grades/detail";
import { SemesterBlock } from "../components/grades/semester";
import { GradeSummary } from "../components/grades/summary";
import { Page } from "../components/page";
import { SyncButton } from "../components/sync-button";
import { api } from "../lib/api";
import { currentSemester, type Grade, type Semester } from "../lib/grades";
import { navColor } from "../lib/nav";
import { isConnected } from "../lib/connections.server";
import { requireToken } from "../lib/session";
import { syncState } from "../lib/sync.server";

const noAttempts: never[] = [];

export function meta() {
  return [{ title: "Grades" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const token = await requireToken(request);
  const [list, sync, connected] = await Promise.all([
    api("/api/grades/list", { headers: { Authorization: `Bearer ${token}` } }),
    syncState(token, "dualis"),
    isConnected(token, "dualis"),
  ]);
  const semesters: Semester[] = list.ok
    ? ((await list.json()).semesters ?? [])
    : [];

  return { semesters, sync, connected };
}

export default function Grades({ loaderData }: Route.ComponentProps) {
  const { semesters, sync, connected } = loaderData;
  const openSemester = currentSemester(semesters);
  const [selected, setSelected] = useState<Grade | null>(null);
  const close = useCallback(() => setSelected(null), []);

  function toggle(module: Grade) {
    setSelected((current) => (current?.id === module.id ? null : module));
  }

  return (
    <Page
      title="Grades"
      icon="grades"
      color={navColor("grades")}
      actions={<SyncButton job="dualis" state={sync} />}
    >
      {semesters.length === 0 ? (
        <EmptySync connected={connected} />
      ) : (
        <Stack>
          <GradeSummary
            modules={semesters.flatMap((semester) => semester.modules)}
          />

          <div className="@container flex items-start">
            <div className="flex min-w-0 flex-1 flex-col gap-4">
              {semesters.map((semester) => (
                <SemesterBlock
                  key={semester.id}
                  semester={semester}
                  defaultOpen={semester.id === openSemester}
                  selectedId={selected?.id ?? null}
                  onSelect={toggle}
                />
              ))}
            </div>

            <ModuleDetail
              module={selected}
              attempts={selected ? (selected.attempts ?? noAttempts) : null}
              onClose={close}
            />
          </div>
        </Stack>
      )}
    </Page>
  );
}
