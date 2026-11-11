import { useState } from "react";
import { Toast } from "../toast";

export function useFlash() {
  const [failure, setFailure] = useState({ message: "", attempt: 0 });

  return {
    fail(message: string) {
      setFailure((current) => ({ message, attempt: current.attempt + 1 }));
    },
    toast: (
      <Toast
        key={failure.attempt}
        message={failure.attempt > 0 ? failure.message : null}
      />
    ),
  };
}
