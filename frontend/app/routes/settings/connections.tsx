import { Icon } from "../../components/icons";
import {
  Placeholder,
  SettingsPanel,
  SettingsSection,
} from "../../components/settings-section";

export default function ConnectionsSettings() {
  return (
    <SettingsPanel>
      <SettingsSection>
        <Placeholder
          icon={<Icon name="connections" className="size-5" />}
          hint="Nothing connected."
        />
      </SettingsSection>
    </SettingsPanel>
  );
}
