import { Link } from "react-router";
import type { Route } from "./+types/machine";
import { Badge, Block, Stack } from "../components/block";
import { MachineControls } from "../components/machine/controls";
import { TerminalWorkspace } from "../components/machine/workspace";
import { Page } from "../components/page";
import { buttonClass } from "../components/setting-row";
import type { ActionResult } from "../components/use-submission";
import { listMachines, wakeMachine } from "../lib/machine.server";
import { demoMachines, isDemoMachine } from "../lib/machine-demo";
import { navColor } from "../lib/nav";
import { requireToken } from "../lib/session";
import { terminalFontHref } from "../lib/terminal-theme";

export const links: Route.LinksFunction = () => [
  { rel: "stylesheet", href: terminalFontHref },
];

export function meta() {
  return [{ title: "Machine" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const token = await requireToken(request);
  const real = await listMachines(token);
  const demo = real.length === 0;
  const machines = demo ? demoMachines : real;
  const wanted = Number(new URL(request.url).searchParams.get("m"));
  const machine = machines.find((entry) => entry.id === wanted) ?? machines[0] ?? null;

  return { machines, selected: machine?.id ?? null, demo };
}

export async function action({ request }: Route.ActionArgs): Promise<ActionResult> {
  const token = await requireToken(request);
  const form = await request.formData();
  if (form.get("intent") === "wake" && isDemoMachine(Number(form.get("id")))) {
    return { ok: true, message: "Wake signal sent (demo)." };
  }
  if (form.get("intent") === "wake") return wakeMachine(token, form);
  return { ok: false, message: "Unknown action" };
}

export default function MachinePage({ loaderData }: Route.ComponentProps) {
  const { machines, selected, demo } = loaderData;
  const machine = machines.find((entry) => entry.id === selected) ?? null;

  return (
    <Page
      title="Machine"
      icon="machine"
      color={navColor("machine")}
      flush={machine !== null}
      actions={
        machine && (
          <>
            {demo && <Badge>Demo</Badge>}
            <MachineControls machines={machines} machine={machine} />
          </>
        )
      }
    >
      {machine ? (
        <TerminalWorkspace key={machine.id} machine={machine} />
      ) : (
        <Stack>
          <Block>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-ui-fg-muted">No machine yet.</p>
              <Link
                to="/settings/connections"
                className={`${buttonClass} inline-flex items-center`}
              >
                Open connections
              </Link>
            </div>
          </Block>
        </Stack>
      )}
    </Page>
  );
}
