import { useFetcher } from "react-router";
import { ExpandableBlock } from "../block";
import { Icon } from "../icons";
import { Field, inputClass } from "../setting-row";
import { AddDeviceForm, ConnectedCount, RemoveDevice } from "./device";
import { lightAddress, kinds, scenes, type Light } from "../../lib/light";
import { navColor } from "../../lib/nav";

export type LightProfile = {
  light_id: number;
  kind: string;
  scenes: string[] | null;
};

type LightsConnectionProps = {
  lights: Light[];
  profiles: LightProfile[];
};

export function LightsConnection({ lights, profiles }: LightsConnectionProps) {
  const byLight = new Map(profiles.map((entry) => [entry.light_id, entry]));

  return (
    <ExpandableBlock
      title="Lights"
      icon="lights"
      color={navColor("lights")}
      summary={<ConnectedCount count={lights.length} />}
    >
      {lights.length > 0 && (
        <ul className="flex flex-col divide-y divide-ui-border-soft">
          {lights.map((light) => (
            <LightRow
              key={light.id}
              light={light}
              profile={byLight.get(light.id)}
            />
          ))}
        </ul>
      )}

      <AddDeviceForm label="Add light" intent="add-light">
        <Field label="Name">
          <input
            name="name"
            required
            maxLength={100}
            autoComplete="off"
            className={inputClass}
          />
        </Field>
        <Field label="Address">
          <input
            name="url"
            required
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            placeholder="192.168.1.50"
            className={`${inputClass} font-mono`}
          />
        </Field>
        <Field label="Kind">
          <select name="kind" defaultValue="wled" className={inputClass}>
            {kinds.map((entry) => (
              <option key={entry.value} value={entry.value}>
                {entry.label} — {entry.hint}
              </option>
            ))}
          </select>
        </Field>
      </AddDeviceForm>
    </ExpandableBlock>
  );
}

// One device, one row. The kind and the scenes save on change, so there is no
// button to hunt for; an empty scene set means the device follows its kind.
function LightRow({
  light,
  profile,
}: {
  light: Light;
  profile?: LightProfile;
}) {
  const fetcher = useFetcher();
  const kind = profile?.kind ?? "wled";
  const picked = profile?.scenes ?? [];

  return (
    <li className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0">
      <div className="flex items-center gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-full border border-ui-border text-[var(--accent)]">
          <Icon name="lights" className="size-5" />
        </span>

        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-ui-fg">
            {light.name}
          </span>
          <span className="block truncate font-mono text-xs text-ui-fg-muted">
            {lightAddress(light.url)}
          </span>
        </span>

        <RemoveDevice id={light.id} intent="delete-light" />
      </div>

      <fetcher.Form
        method="post"
        onChange={(event) => fetcher.submit(event.currentTarget)}
        className="flex flex-wrap items-center gap-x-4 gap-y-2 pl-12"
      >
        <input type="hidden" name="intent" value="set-light-profile" />
        <input type="hidden" name="id" value={light.id} />

        <select
          name="kind"
          defaultValue={kind}
          aria-label={`Kind of ${light.name}`}
          className={`${inputClass} h-8 w-28 text-xs`}
        >
          {kinds.map((entry) => (
            <option key={entry.value} value={entry.value}>
              {entry.label}
            </option>
          ))}
        </select>

        {scenes.map((scene) => (
          <label
            key={scene.value}
            className="flex items-center gap-1.5 text-xs text-ui-fg-muted"
          >
            <input
              type="checkbox"
              name="scenes"
              value={scene.value}
              defaultChecked={picked.includes(scene.value)}
              className="size-3.5 accent-ctp-mauve"
            />
            {scene.label}
          </label>
        ))}

        {picked.length === 0 && (
          <span className="text-xs text-ui-fg-faint">follows its kind</span>
        )}
      </fetcher.Form>
    </li>
  );
}
