import { useEffect, useState } from "react";

export function useTicker(initial: number, stepMs: number) {
  const [now, setNow] = useState(initial);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const current = Date.now();
      setNow(current);
      timer = setTimeout(tick, stepMs - (current % stepMs) + 20);
    };
    tick();
    return () => clearTimeout(timer);
  }, [stepMs]);

  return now;
}
