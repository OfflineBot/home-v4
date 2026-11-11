import { useState } from "react";
import { Link } from "react-router";
import type { Route } from "./+types/lights";
import { Badge, Block, Stack } from "../components/block";
import { Icon } from "../components/icons";
import { AllLightsCard, LightCard } from "../components/lights/light-card";
import { useLights } from "../components/lights/use-lights";
import { Page } from "../components/page";
import { buttonClass, primaryButtonClass } from "../components/setting-row";
import { Toast } from "../components/toast";
import type { Light } from "../lib/light";
import { listLights } from "../lib/light.server";
import { demoLights } from "../lib/light-demo";
import { navColor } from "../lib/nav";
import { requireToken } from "../lib/session";

export function meta() {
  return [{ title: "Lights" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const token = await requireToken(request);
  const lights = await listLights(token);
  return lights.length > 0 ? { lights, demo: false } : { lights: demoLights, demo: true };
}

function LightsBoard({ lights, demo }: { lights: Light[]; demo: boolean }) {
  const [failure, setFailure] = useState({ message: "", attempt: 0 });
  const { entries, apply, load } = useLights(lights, (message) =>
    setFailure((current) => ({ message, attempt: current.attempt + 1 })),
  );
  const list = lights.map((light) => entries[light.id]).filter(Boolean);
  const reachable = list.filter((entry) => entry.status === "ready" && entry.state);

  function switchAll(on: boolean) {
    for (const entry of reachable) apply(entry.light.id, { on });
  }

  return (
    <Page
      title="Lights"
      icon="lights"
      color={navColor("lights")}
      actions={
        <>
          {demo && <Badge>Demo</Badge>}
          <button
            type="button"
            disabled={reachable.length === 0}
            onClick={() => switchAll(false)}
            className={`${buttonClass} inline-flex items-center gap-1.5`}
          >
            <Icon name="power" className="size-4" />
            All off
          </button>
          <button
            type="button"
            disabled={reachable.length === 0}
            onClick={() => switchAll(true)}
            className={`${primaryButtonClass} inline-flex items-center gap-1.5`}
          >
            <Icon name="lights" className="size-4" />
            All on
          </button>
        </>
      }
    >
      <Stack>
        {list.length > 1 && <AllLightsCard entries={list} onApply={apply} />}
        {list.map((entry) => (
          <LightCard
            key={entry.light.id}
            entry={entry}
            onApply={(change) => apply(entry.light.id, change)}
            onRetry={() => void load(entry.light)}
          />
        ))}
      </Stack>
      <Toast key={failure.attempt} message={failure.attempt > 0 ? failure.message : null} />
    </Page>
  );
}

export default function Lights({ loaderData }: Route.ComponentProps) {
  const { lights, demo } = loaderData;

  if (lights.length === 0) {
    return (
      <Page title="Lights" icon="lights" color={navColor("lights")}>
        <Stack>
          <Block>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-ui-fg-muted">No light yet.</p>
              <Link to="/settings/connections" className={`${buttonClass} inline-flex items-center`}>
                Open connections
              </Link>
            </div>
          </Block>
        </Stack>
      </Page>
    );
  }

  return <LightsBoard key={lights.map((light) => light.id).join(",")} lights={lights} demo={demo} />;
}
