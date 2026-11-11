import { dangerButtonClass } from "../../components/setting-row";
import {
  SettingsPanel,
  SettingsSection,
} from "../../components/settings-section";

export default function DeleteAccountSettings() {
  return (
    <SettingsPanel>
      <SettingsSection hint="This cannot be undone.">
        <button type="button" className={dangerButtonClass} disabled>
          Delete account
        </button>
      </SettingsSection>
    </SettingsPanel>
  );
}
