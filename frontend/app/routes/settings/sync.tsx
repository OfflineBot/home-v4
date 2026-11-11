import { Icon } from "../../components/icons";
import { Block, Placeholder, Stack } from "../../components/block";

export default function SyncSettings() {
  return (
    <Stack>
      <Block>
        <Placeholder
          icon={<Icon name="sync" className="size-5" />}
          hint="Nothing scheduled."
        />
      </Block>
    </Stack>
  );
}
