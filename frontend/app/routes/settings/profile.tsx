import { useRouteLoaderData } from "react-router";
import {
  buttonClass,
  fieldStackClass,
  inputClass,
} from "../../components/setting-row";
import {
  Badge,
  SettingsPanel,
  SettingsSection,
} from "../../components/settings-section";

export default function ProfileSettings() {
  const data = useRouteLoaderData("routes/settings/layout") as
    { me: { name: string; is_admin: boolean } | null } | undefined;
  const me = data?.me;

  return (
    <SettingsPanel>
      <SettingsSection
        title="Display name"
        status={
          me?.is_admin ? <Badge tone="accent">Administrator</Badge> : null
        }
      >
        <div className={fieldStackClass}>
          <input
            defaultValue={me?.name ?? ""}
            className={inputClass}
            disabled
          />
          <button
            type="button"
            className={`${buttonClass} self-start`}
            disabled
          >
            Save
          </button>
        </div>
      </SettingsSection>
    </SettingsPanel>
  );
}
