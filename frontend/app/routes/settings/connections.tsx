import type { Route } from "./+types/connections";
import { Stack } from "../../components/block";
import { DHBWConnection } from "../../components/connections/dhbw";
import { LightsConnection } from "../../components/connections/lights";
import { MachineConnection } from "../../components/connections/machine";
import { api, unreachableStatus } from "../../lib/api";
import {
  dhbwError,
  dhbwLabel,
  isDHBWModule,
  joinCourse,
  timetableModule,
  type DHBWAccount,
  type DHBWResult,
} from "../../lib/dhbw";
import {
  createLight,
  deleteLight,
  listLightProfiles,
  listLights,
  setLightProfile,
} from "../../lib/light.server";
import {
  createMachine,
  deleteMachine,
  listMachines,
} from "../../lib/machine.server";
import { requireToken } from "../../lib/session";

const dhbwPath = "/api/connections/dhbw";
const timetablePath = "/api/connections/timetable";
const verifyTimeoutMs = 90000;

export async function loader({ request }: Route.LoaderArgs) {
  const token = await requireToken(request);
  const headers = { Authorization: `Bearer ${token}` };
  const [dhbw, timetable, machines, lights, lightProfiles] = await Promise.all([
    api(dhbwPath, { headers }),
    api(timetablePath, { headers }),
    listMachines(token),
    listLights(token),
    listLightProfiles(token),
  ]);

  return {
    dhbw: dhbw.ok ? ((await dhbw.json()) as DHBWAccount) : null,
    timetable: timetable.ok
      ? (((await timetable.json()) as { course?: string | null }).course ??
        null)
      : null,
    machines,
    lights,
    lightProfiles,
  };
}

type DHBWTarget = {
  path: string;
  body?: Record<string, string | boolean>;
  module: string;
  success: string;
};

function dhbwTarget(form: FormData): DHBWTarget | null {
  const intent = String(form.get("intent") ?? "");
  const module = String(form.get("module") ?? "");

  if (intent === "dhbw-name") {
    return {
      path: `${dhbwPath}/name`,
      body: { name: String(form.get("name") ?? "") },
      module,
      success: "Username saved.",
    };
  }
  if (intent === "dhbw-name-remove") {
    return {
      path: `${dhbwPath}/name/delete`,
      module,
      success: "Username removed.",
    };
  }
  if (intent === "dhbw-passwords-remove") {
    return {
      path: `${dhbwPath}/passwords/delete`,
      module,
      success: "All passwords removed.",
    };
  }
  if (intent === "dualis-reset") {
    return {
      path: `${dhbwPath}/dualis/reset`,
      body: { confirm: true },
      module: "dualis",
      success: "Dualis lock reset. The next sync tries again.",
    };
  }
  if (intent === "timetable-set") {
    const site = String(form.get("location") ?? "");
    return {
      path: timetablePath,
      body: {
        site,
        course: joinCourse(site, String(form.get("course") ?? "")),
      },
      module: timetableModule,
      success: "Course saved. The first sync is running.",
    };
  }
  if (intent === "timetable-remove") {
    return {
      path: `${timetablePath}/delete`,
      module: timetableModule,
      success: "Course removed.",
    };
  }
  if (!isDHBWModule(module)) return null;

  if (intent === "dhbw-password") {
    return {
      path: `${dhbwPath}/${module}/password`,
      body: { password: String(form.get("password") ?? "") },
      module,
      success: `${dhbwLabel(module)} login works. Password saved.`,
    };
  }
  if (intent === "dhbw-remove") {
    return {
      path: `${dhbwPath}/${module}/password/delete`,
      module,
      success: `${dhbwLabel(module)} password removed.`,
    };
  }

  return null;
}

export async function action({
  request,
}: Route.ActionArgs): Promise<DHBWResult> {
  const token = await requireToken(request);
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");
  if (intent === "add-machine") return createMachine(token, form);
  if (intent === "delete-machine") return deleteMachine(token, form);
  if (intent === "add-light") return createLight(token, form);
  if (intent === "set-light-profile") return setLightProfile(token, form);
  if (intent === "delete-light") return deleteLight(token, form);

  const target = dhbwTarget(form);
  if (!target) return { ok: false, message: "Unknown action" };

  const res = await api(target.path, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(target.body ?? {}),
    signal: AbortSignal.timeout(verifyTimeoutMs),
  });

  if (res.ok) return { ok: true, message: target.success };
  if (res.status === unreachableStatus) {
    return { ok: false, message: "Backend not reachable" };
  }

  const data = await res.json().catch(() => ({}));
  return {
    ok: false,
    message: dhbwError(data.error, data.module ?? target.module, res.status),
  };
}

export default function ConnectionsSettings({
  loaderData,
}: Route.ComponentProps) {
  return (
    <Stack>
      <DHBWConnection
        account={loaderData.dhbw}
        timetable={loaderData.timetable}
      />
      <MachineConnection machines={loaderData.machines} />
      <LightsConnection
        lights={loaderData.lights}
        profiles={loaderData.lightProfiles}
      />
    </Stack>
  );
}
