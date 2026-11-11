import { useRouteLoaderData } from "react-router";
import { buttonClass, inputClass } from "../../components/setting-row";
import { Badge, Block, Stack } from "../../components/block";

export default function ProfileSettings() {
  const data = useRouteLoaderData("routes/settings/layout") as
    { me: { name: string; is_admin: boolean } | null } | undefined;
  const me = data?.me;

  return (
    <Stack>
      <Block
        title="Display name"
        status={
          me?.is_admin ? <Badge tone="accent">Administrator</Badge> : null
        }
      >
        <div className="flex max-w-sm flex-col gap-2">
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
      </Block>
    </Stack>
  );
}
