import { ExpandableBlock } from "../block";
import { Field, inputClass } from "../setting-row";
import { AddDeviceForm, ConnectedCount, DeviceList } from "./device";
import {
  defaultSSHPort,
  defaultWakeOnLanPort,
  type Machine,
} from "../../lib/machine";
import { navColor } from "../../lib/nav";
import { ipv4Pattern, macPattern } from "../../lib/network";

type MachineConnectionProps = {
  machines: Machine[];
};

export function MachineConnection({ machines }: MachineConnectionProps) {
  return (
    <ExpandableBlock
      title="Machine"
      icon="machine"
      color={navColor("machine")}
      summary={<ConnectedCount count={machines.length} />}
    >
      <DeviceList
        icon="machine"
        removeIntent="delete-machine"
        wired
        devices={machines.map((machine) => ({
          id: machine.id,
          title: machine.name,
          detail: `${machine.mac} · ${machine.username}@${machine.ip}:${machine.ssh_port}`,
        }))}
      />

      <AddDeviceForm label="Add machine" intent="add-machine" wired>
        <Field label="Name" className="sm:col-span-2">
          <input
            name="name"
            required
            autoComplete="off"
            className={inputClass}
          />
        </Field>
        <Field label="MAC address">
          <input
            name="mac"
            required
            pattern={macPattern}
            autoComplete="off"
            spellCheck={false}
            className={`${inputClass} font-mono`}
          />
        </Field>
        <Field label="IP address">
          <input
            name="ip"
            required
            pattern={ipv4Pattern}
            inputMode="decimal"
            autoComplete="off"
            className={`${inputClass} font-mono`}
          />
        </Field>
        <Field label="Broadcast address">
          <input
            name="broadcast"
            required
            pattern={ipv4Pattern}
            inputMode="decimal"
            autoComplete="off"
            className={`${inputClass} font-mono`}
          />
        </Field>
        <Field label="SSH user">
          <input
            name="username"
            required
            autoComplete="off"
            spellCheck={false}
            className={inputClass}
          />
        </Field>
        <Field label="SSH port">
          <input
            name="ssh_port"
            type="number"
            required
            min={1}
            max={65535}
            defaultValue={defaultSSHPort}
            className={inputClass}
          />
        </Field>
        <Field label="Wake on LAN port">
          <input
            name="wake_on_lan_port"
            type="number"
            required
            min={1}
            max={65535}
            defaultValue={defaultWakeOnLanPort}
            className={inputClass}
          />
        </Field>
      </AddDeviceForm>
    </ExpandableBlock>
  );
}
