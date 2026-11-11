import { Link } from "react-router";
import { Block } from "./block";

export function EmptySync({ connected }: { connected: boolean }) {
  return (
    <Block>
      {connected ? (
        <p className="text-sm text-ui-fg-muted">Nothing synced yet.</p>
      ) : (
        <Link
          to="/settings/connections"
          className="text-sm text-[var(--accent-fg)] underline-offset-4 hover:underline"
        >
          Open connections
        </Link>
      )}
    </Block>
  );
}
