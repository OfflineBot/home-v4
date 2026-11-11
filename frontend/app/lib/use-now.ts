import { useEffect, useState } from "react";
import { nowIn } from "./calendar";

const tickMs = 30_000;

export function useNow() {
  const [now, setNow] = useState<ReturnType<typeof nowIn> | null>(null);

  useEffect(() => {
    const tick = () => setNow(nowIn());
    tick();
    const id = setInterval(tick, tickMs);
    return () => clearInterval(id);
  }, []);

  return now;
}
