import { useEffect, useState } from "react";
import { useFetcher } from "react-router";
import { inputClass } from "./setting-row";
import { Toast } from "./toast";

export type ActionResult = {
  ok: boolean;
  message: string;
};

const flashMs = 1600;

export function useSubmission() {
  const fetcher = useFetcher<ActionResult>();
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);
  const busy = fetcher.state !== "idle";

  useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data) return;

    setAttempt((current) => current + 1);
    if (fetcher.data.ok) return;

    setFailed(true);
    const id = setTimeout(() => setFailed(false), flashMs);
    return () => clearTimeout(id);
  }, [fetcher.state, fetcher.data]);

  const error =
    !busy && fetcher.data && !fetcher.data.ok ? fetcher.data.message : null;

  return {
    fetcher,
    busy,
    intent: fetcher.formData?.get("intent"),
    failed,
    fieldClass: `${inputClass} transition-colors duration-300 motion-reduce:transition-none ${
      failed ? "border-ui-danger!" : ""
    }`,
    toast: <Toast key={attempt} message={error} />,
  };
}
