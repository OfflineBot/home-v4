import { useState, type InputHTMLAttributes } from "react";
import { inputClass } from "./setting-row";
import { formatTime, parseTime } from "../lib/calendar";

// A plain field, not type="time": Chrome renders the native control in the
// browser's own locale, which puts it in am/pm no matter what the page says.
type TimeInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "value" | "onChange" | "type"
> & {
  value: string;
  onChange: (value: string) => void;
};

const stepMinutes = 5;

function minutesOf(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

export function TimeInput({ value, onChange, ...rest }: TimeInputProps) {
  const [draft, setDraft] = useState(value);
  const [shown, setShown] = useState(value);

  if (value !== shown) {
    setShown(value);
    setDraft(value);
  }

  function commit(text: string) {
    const time = parseTime(text);
    setDraft(time ?? value);
    if (time && time !== value) onChange(time);
  }

  function step(by: number) {
    const base = parseTime(draft) ?? value;
    const next = formatTime((minutesOf(base) + by + 1440) % 1440);
    setDraft(next);
    onChange(next);
  }

  return (
    <input
      {...rest}
      inputMode="numeric"
      placeholder="HH:MM"
      autoComplete="off"
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={(event) => commit(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter") commit(draft);
        if (event.key === "ArrowUp" || event.key === "ArrowDown") {
          event.preventDefault();
          step(event.key === "ArrowUp" ? stepMinutes : -stepMinutes);
        }
      }}
      className={`${inputClass} tabular-nums`}
    />
  );
}
