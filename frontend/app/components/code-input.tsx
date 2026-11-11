import { useEffect, useRef, useState } from "react";

const length = 6;
const groupAfter = 3;

type CodeInputProps = {
  name: string;
  autoSubmit: boolean;
  disabled?: boolean;
};

export function CodeInput({ name, autoSubmit, disabled }: CodeInputProps) {
  const [digits, setDigits] = useState<string[]>(() =>
    Array.from({ length }, () => ""),
  );
  const boxes = useRef<(HTMLInputElement | null)[]>([]);
  const hidden = useRef<HTMLInputElement>(null);
  const submitted = useRef(false);

  const value = digits.join("");
  const complete = value.length === length;

  useEffect(() => {
    boxes.current[0]?.focus();
  }, []);

  // fires after the hidden input already carries the full value
  useEffect(() => {
    if (!complete || !autoSubmit || submitted.current) return;

    submitted.current = true;
    hidden.current?.form?.requestSubmit();
  }, [complete, autoSubmit]);

  useEffect(() => {
    if (!autoSubmit) submitted.current = false;
  }, [autoSubmit]);

  function write(index: number, next: string[]) {
    setDigits(next);
    const empty = next.findIndex((d) => d === "");
    boxes.current[empty === -1 ? length - 1 : empty]?.focus();
  }

  function onChange(index: number, raw: string) {
    const typed = raw.replace(/\D/g, "");
    if (!typed) return;

    const next = [...digits];
    for (let i = 0; i < typed.length && index + i < length; i++) {
      next[index + i] = typed[i];
    }
    write(index, next);
  }

  function onKeyDown(
    index: number,
    event: React.KeyboardEvent<HTMLInputElement>,
  ) {
    if (event.key === "Backspace") {
      event.preventDefault();
      const next = [...digits];

      if (next[index]) {
        next[index] = "";
        setDigits(next);
      } else if (index > 0) {
        next[index - 1] = "";
        setDigits(next);
        boxes.current[index - 1]?.focus();
      }
      return;
    }
    if (event.key === "ArrowLeft" && index > 0) {
      event.preventDefault();
      boxes.current[index - 1]?.focus();
    }
    if (event.key === "ArrowRight" && index < length - 1) {
      event.preventDefault();
      boxes.current[index + 1]?.focus();
    }
  }

  function onPaste(event: React.ClipboardEvent<HTMLInputElement>) {
    const pasted = event.clipboardData.getData("text").replace(/\D/g, "");
    if (!pasted) return;

    event.preventDefault();
    const next = Array.from({ length }, (_, i) => pasted[i] ?? "");
    write(0, next);
  }

  return (
    <div className="flex items-center justify-center gap-2">
      {digits.map((digit, index) => (
        <div key={index} className="flex items-center gap-2">
          {index === groupAfter && (
            <span aria-hidden className="h-px w-3 bg-ui-border" />
          )}
          <input
            ref={(el) => {
              boxes.current[index] = el;
            }}
            type="text"
            inputMode="numeric"
            autoComplete={index === 0 ? "one-time-code" : "off"}
            maxLength={1}
            value={digit}
            disabled={disabled}
            aria-label={`Digit ${index + 1}`}
            onChange={(e) => onChange(index, e.target.value)}
            onKeyDown={(e) => onKeyDown(index, e)}
            onPaste={onPaste}
            onFocus={(e) => e.target.select()}
            className="size-11 rounded-md border border-ui-border bg-ui-field text-center text-lg text-ui-fg tabular-nums outline-none focus:border-ctp-mauve disabled:opacity-60"
          />
        </div>
      ))}

      <input ref={hidden} type="hidden" name={name} value={value} readOnly />
    </div>
  );
}
