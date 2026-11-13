import { Form } from "react-router";
import { ExpandableBlock } from "../block";
import { Icon } from "../icons";
import { Field, buttonClass, inputClass } from "../setting-row";
import { AddDeviceForm, ConnectedCount, DeviceList } from "./device";
import { lightAddress, scenes, type Light } from "../../lib/light";
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

const kinds = [
  { value: "wled", label: "WLED" },
  { value: "shelly", label: "Shelly" },
];

export function LightsConnection({ lights, profiles }: LightsConnectionProps) {
  const byLight = new Map(profiles.map((entry) => [entry.light_id, entry]));

  return (
    <ExpandableBlock
      title="Lights"
      icon="lights"
      color={navColor("lights")}
      summary={<ConnectedCount count={lights.length} />}
    >
      <DeviceList
        icon="lights"
        removeIntent="delete-light"
        devices={lights.map((light) => ({
          id: light.id,
          title: light.name,
          detail: lightAddress(light.url),
        }))}
      />

      {lights.length > 0 && (
        <div className="flex flex-col gap-3">
          {lights.map((light) => (
            <ProfileForm
              key={light.id}
              light={light}
              profile={byLight.get(light.id)}
            />
          ))}
        </div>
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
            className={`${inputClass} font-mono`}
          />
        </Field>
      </AddDeviceForm>
    </ExpandableBlock>
  );
}

// An empty scene selection means the device follows its kind: WLED answers to
// "LED only", everything else to "No LED only". Ticking boxes overrides that.
function ProfileForm({
  light,
  profile,
}: {
  light: Light;
  profile?: LightProfile;
}) {
  const kind = profile?.kind ?? "wled";
  const picked = profile?.scenes ?? [];

  return (
    <Form method="post" className="rounded-lg border border-ui-border-soft p-3">
      <input type="hidden" name="intent" value="set-light-profile" />
      <input type="hidden" name="id" value={light.id} />

      <div className="flex flex-wrap items-center gap-3">
        <span className="flex items-center gap-2 text-sm font-medium text-ui-fg">
          <Icon name="lights" className="size-4" />
          {light.name}
        </span>

        <select
          name="kind"
          defaultValue={kind}
          className={`${inputClass} w-32`}
        >
          {kinds.map((entry) => (
            <option key={entry.value} value={entry.value}>
              {entry.label}
            </option>
          ))}
        </select>

        <button type="submit" className={`${buttonClass} ml-auto`}>
          Save
        </button>
      </div>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
        {scenes.map((scene) => (
          <label
            key={scene.value}
            className="flex items-center gap-2 text-sm text-ui-fg-muted"
          >
            <input
              type="checkbox"
              name="scenes"
              value={scene.value}
              defaultChecked={picked.includes(scene.value)}
              className="size-4 accent-ctp-mauve"
            />
            {scene.label}
          </label>
        ))}
      </div>
    </Form>
  );
}
