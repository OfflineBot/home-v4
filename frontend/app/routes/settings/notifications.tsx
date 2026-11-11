import { Icon } from "../../components/icons";
import { Block, Placeholder, Stack } from "../../components/block";

export default function NotificationsSettings() {
  return (
    <Stack>
      <Block>
        <Placeholder
          icon={<Icon name="notifications" className="size-5" />}
          hint="No channels."
        />
      </Block>
    </Stack>
  );
}
