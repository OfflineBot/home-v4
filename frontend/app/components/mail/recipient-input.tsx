import { useId, useState } from "react";
import { inputClass } from "../setting-row";
import { useContactSuggestions } from "./use-contacts";
import { mergeContacts, type Contact } from "../../lib/mail";

type RecipientInputProps = {
  name: string;
  label: string;
  defaultValue: string;
  autoFocus?: boolean;
  required?: boolean;
};

function split(value: string) {
  const parts = value.split(",");
  return {
    done: parts.slice(0, -1).map((part) => part.trim()).filter(Boolean),
    current: parts[parts.length - 1] ?? "",
  };
}

export function RecipientInput({
  name,
  label,
  defaultValue,
  autoFocus,
  required,
}: RecipientInputProps) {
  const listId = useId();
  const [value, setValue] = useState(defaultValue);
  const [focused, setFocused] = useState(false);
  const [active, setActive] = useState(0);

  const { done, current } = split(value);
  const suggestions = mergeContacts(
    useContactSuggestions(current, focused),
    done,
  );
  const open = suggestions.length > 0;

  function pick(contact: Contact) {
    setValue([...done, contact.email].join(", ") + ", ");
    setActive(0);
  }

  return (
    <div className="relative">
      <input
        name={name}
        aria-label={label}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open ? `${listId}-${active}` : undefined}
        value={value}
        required={required}
        autoFocus={autoFocus}
        autoComplete="off"
        spellCheck={false}
        onChange={(event) => {
          setValue(event.target.value);
          setActive(0);
          setFocused(true);
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={(event) => {
          if (!open) return;
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            const step = event.key === "ArrowDown" ? 1 : -1;
            setActive((index) => (index + step + suggestions.length) % suggestions.length);
          } else if (event.key === "Enter" || event.key === "Tab") {
            event.preventDefault();
            pick(suggestions[Math.min(active, suggestions.length - 1)]);
          } else if (event.key === "Escape") {
            event.preventDefault();
            setFocused(false);
          }
        }}
        className={inputClass}
      />

      {open && (
        <ul
          id={listId}
          role="listbox"
          className="absolute top-full right-0 left-0 z-30 mt-1 overflow-hidden rounded-lg border border-ui-border bg-ui-raised p-1"
        >
          {suggestions.map((contact, index) => (
            <li
              key={contact.email}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === active}
              onMouseDown={(event) => {
                event.preventDefault();
                pick(contact);
              }}
              onMouseEnter={() => setActive(index)}
              className={`flex cursor-pointer flex-col rounded-md px-2 py-1.5 ${
                index === active ? "bg-ui-hover" : ""
              }`}
            >
              {contact.name && (
                <span className="truncate text-sm text-ui-fg">{contact.name}</span>
              )}
              <span
                className={`truncate font-mono ${
                  contact.name ? "text-xs text-ui-fg-muted" : "text-sm text-ui-fg"
                }`}
              >
                {contact.email}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
