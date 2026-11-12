import { type InputHTMLAttributes } from "react";
import { inputClass } from "./setting-row";

type TimeInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "value" | "onChange" | "type"
> & {
  value: string;
  onChange: (value: string) => void;
};

export function TimeInput({ value, onChange, ...rest }: TimeInputProps) {
  return (
    <input
      {...rest}
      type="time"
      step={300}
      value={value}
      onChange={(event) => {
        if (event.target.value) onChange(event.target.value);
      }}
      className={`${inputClass} tabular-nums [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-50 [&::-webkit-calendar-picker-indicator]:hover:opacity-100`}
    />
  );
}
