import { Icon } from "../../components/icons";
import {
  Placeholder,
  SettingsPanel,
  SettingsSection,
} from "../../components/settings-section";

export default function SyncSettings() {
  return (
    <SettingsPanel>
      <SettingsSection>
        <Placeholder
          icon={<Icon name="sync" className="size-5" />}
          hint="Nothing scheduled."
        />
      </SettingsSection>
    </SettingsPanel>
  );
}
