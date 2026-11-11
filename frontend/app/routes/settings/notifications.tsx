import { Icon } from "../../components/icons";
import {
  Placeholder,
  SettingsPanel,
  SettingsSection,
} from "../../components/settings-section";

export default function NotificationsSettings() {
  return (
    <SettingsPanel>
      <SettingsSection>
        <Placeholder
          icon={<Icon name="notifications" className="size-5" />}
          hint="No channels."
        />
      </SettingsSection>
    </SettingsPanel>
  );
}
