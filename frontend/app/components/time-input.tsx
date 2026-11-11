import { useState, type InputHTMLAttributes } from "react";
import { inputClass } from "./setting-row";
import { parseTime } from "../lib/calendar";

const complete = /^\d{2}:\d{2}$/;

type TimeInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "value" | "onChange" | "type"
> & {
  value: string;
  onChange: (value: string) => void;
};

export function TimeInput({ value, onChange, ...rest }: TimeInputProps) {
  const [text, setText] = useState(value);
  const [synced, setSynced] = useState(value);

  if (value !== synced) {
    setSynced(value);
    setText(value);
  }

  function commit(next: string) {
    setSynced(next);
    onChange(next);
  }

  return (
    <input
      {...rest}
      type="text"
      value={text}
      inputMode="numeric"
      autoComplete="off"
      placeholder="HH:MM"
      maxLength={5}
      pattern="([01]\d|2[0-3]):[0-5]\d"
      onChange={(event) => {
        setText(event.target.value);
        const parsed = complete.test(event.target.value)
          ? parseTime(event.target.value)
          : null;
        if (parsed) commit(parsed);
      }}
      onBlur={() => {
        const parsed = parseTime(text);
        setText(parsed ?? value);
        if (parsed) commit(parsed);
      }}
      className={`${inputClass} tabular-nums`}
    />
  );
}
