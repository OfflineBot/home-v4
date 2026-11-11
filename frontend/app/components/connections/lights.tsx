import { ExpandableBlock } from "../block";
import { Field, inputClass } from "../setting-row";
import { AddDeviceForm, ConnectedCount, DeviceList } from "./device";
import { lightAddress, type Light } from "../../lib/light";
import { navColor } from "../../lib/nav";

type LightsConnectionProps = {
  lights: Light[];
};

export function LightsConnection({ lights }: LightsConnectionProps) {
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
