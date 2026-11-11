import { dangerButtonClass } from "../../components/setting-row";
import { Block, Stack } from "../../components/block";

export default function DeleteAccountSettings() {
  return (
    <Stack>
      <Block title="Delete account">
        <p className="text-sm text-ui-fg-muted">This cannot be undone.</p>
        <button type="button" className={`${dangerButtonClass} mt-3`} disabled>
          Delete account
        </button>
      </Block>
    </Stack>
  );
}
