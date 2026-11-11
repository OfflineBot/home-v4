import { Icon } from "../../components/icons";
import { Block, Placeholder, Stack } from "../../components/block";

export default function ConnectionsSettings() {
  return (
    <Stack>
      <Block>
        <Placeholder
          icon={<Icon name="connections" className="size-5" />}
          hint="Nothing connected."
        />
      </Block>
    </Stack>
  );
}
