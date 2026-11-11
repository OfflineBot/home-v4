import { useMemo, useState } from "react";
import { Link } from "react-router";
import { Badge } from "../block";
import { DatePicker } from "../date-picker";
import { Dialog } from "../dialog";
import { Icon } from "../icons";
import {
  Field,
  buttonClass,
  dangerButtonClass,
  fieldGridClass,
  inputClass,
  primaryButtonClass,
  textareaClass,
} from "../setting-row";
import { TimeInput } from "../time-input";
import { dayLong, parseDay } from "../../lib/calendar";
import {
  eventMarks,
  type CalendarCategory,
  type CalendarEvent,
  type EventDraft,
  type EventMark,
} from "../../lib/calendar-events";
import { matchCourse, type CourseRef } from "../../lib/moodle";
import { accentVars } from "../../lib/nav";

type EventDialogProps = {
  draft: EventDraft | null;
  categories: CalendarCategory[];
  courses: CourseRef[];
  onClose: () => void;
  onSave: (draft: EventDraft) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onMark: (event: CalendarEvent, mark: EventMark) => Promise<void>;
};

export function EventDialog({
  draft,
  categories,
  courses,
  onClose,
  onSave,
  onDelete,
  onMark,
}: EventDialogProps) {
  const synced = draft?.source === "timetable" && draft.id !== undefined;
  const title = !draft
    ? ""
    : synced
      ? draft.title
      : draft.id
        ? "Edit event"
        : "New event";

  return (
    <Dialog open={draft !== null} title={title} onClose={onClose}>
      {draft &&
        (synced ? (
          <TimetableDetails
            key={draft.id}
            event={draft as CalendarEvent}
            category={categories.find((entry) => entry.id === draft.categoryId)}
            courses={courses}
            onMark={onMark}
          />
        ) : (
          <EventForm
            key={draft.id ?? draft.start}
            draft={draft}
            categories={categories}
            onCancel={onClose}
            onSave={onSave}
            onDelete={onDelete}
          />
        ))}
    </Dialog>
  );
}

type MarkPickerProps = {
  value: EventMark;
  onChange: (mark: EventMark) => void;
  disabled?: boolean;
};

function MarkPicker({ value, onChange, disabled }: MarkPickerProps) {
  return (
    <fieldset disabled={disabled}>
      <legend className="mb-1 text-xs text-ui-fg-muted">Mark</legend>
      <div className="inline-flex rounded-md border border-ui-border bg-ui-field p-0.5">
        {eventMarks.map((mark) => {
          const active = mark.value === value;

          return (
            <label
              key={mark.value}
              className={`grid h-8 cursor-pointer place-items-center rounded px-3 text-sm transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ui-ring motion-reduce:transition-none ${
                active
                  ? "bg-[color-mix(in_oklab,var(--accent)_18%,transparent)] font-medium text-[var(--accent-fg)]"
                  : "text-ui-fg-muted hover:text-ui-fg"
              }`}
            >
              <input
                type="radio"
                name="mark"
                value={mark.value}
                checked={active}
                onChange={() => onChange(mark.value)}
                className="sr-only"
              />
              {mark.label}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

type TimetableDetailsProps = {
  event: CalendarEvent;
  category?: CalendarCategory;
  courses: CourseRef[];
  onMark: (event: CalendarEvent, mark: EventMark) => Promise<void>;
};

function TimetableDetails({
  event,
  category,
  courses,
  onMark,
}: TimetableDetailsProps) {
  const [mark, setMark] = useState(event.mark);
  const [busy, setBusy] = useState(false);
  const day = parseDay(event.start.slice(0, 10));
  const course = useMemo(
    () => matchCourse(event.title, courses),
    [event.title, courses],
  );

  async function change(next: EventMark) {
    setMark(next);
    setBusy(true);
    try {
      await onMark(event, next);
    } finally {
      setBusy(false);
    }
  }

  const rows: [string, string][] = [
    [
      "When",
      `${day ? dayLong.format(day) : ""} · ${event.start.slice(11, 16)}–${event.end.slice(11, 16)}`,
    ],
    ["Room", event.room || "/"],
    ["Lecturer", event.teacher || "/"],
  ];

  return (
    <div
      style={accentVars(category?.color ?? "blue")}
      className="flex flex-col gap-4"
    >
      <div className="flex flex-wrap gap-1.5">
        {category && <Badge tone="accent">{category.name}</Badge>}
        {event.kind && <Badge>{event.kind}</Badge>}
        {event.online && <Badge>Online</Badge>}
        {event.cancelled && <Badge tone="bad">Cancelled</Badge>}
      </div>

      <dl className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-x-3 gap-y-2 text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-ui-fg-muted">{label}</dt>
            <dd className="text-ui-fg tabular-nums">{value}</dd>
          </div>
        ))}
        {event.description && (
          <div className="contents">
            <dt className="text-ui-fg-muted">Details</dt>
            <dd className="whitespace-pre-line text-ui-fg">
              {event.description}
            </dd>
          </div>
        )}
      </dl>

      {course && (
        <Link
          to={`/moodle/${course.id}`}
          className={`${buttonClass} inline-flex w-fit items-center gap-1.5`}
        >
          <Icon name="moodle" className="size-4" />
          Open in Moodle
        </Link>
      )}

      <MarkPicker value={mark} onChange={change} disabled={busy} />

      <p className="text-xs text-ui-fg-muted">
        Synced from the DHBW timetable. Only the mark can be changed here.
      </p>
    </div>
  );
}

type EventFormProps = {
  draft: EventDraft;
  categories: CalendarCategory[];
  onCancel: () => void;
  onSave: (draft: EventDraft) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
};

function EventForm({
  draft,
  categories,
  onCancel,
  onSave,
  onDelete,
}: EventFormProps) {
  const editable = categories;
  const [title, setTitle] = useState(draft.title);
  const [categoryId, setCategoryId] = useState(
    editable.some((category) => category.id === draft.categoryId)
      ? draft.categoryId
      : (editable[0]?.id ?? ""),
  );
  const [day, setDay] = useState(draft.start.slice(0, 10));
  const [start, setStart] = useState(draft.start.slice(11, 16));
  const [end, setEnd] = useState(draft.end.slice(11, 16));
  const [room, setRoom] = useState(draft.room);
  const [description, setDescription] = useState(draft.description);
  const [mark, setMark] = useState(draft.mark);
  const [busy, setBusy] = useState(false);
  const invalidTime = end <= start;
  const color =
    editable.find((category) => category.id === categoryId)?.color ?? "blue";

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (invalidTime || !categoryId) return;

    setBusy(true);
    try {
      await onSave({
        ...draft,
        source: "custom",
        title: title.trim(),
        categoryId,
        start: `${day}T${start}`,
        end: `${day}T${end}`,
        room: room.trim(),
        description: description.trim(),
        mark,
      });
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setBusy(true);
    try {
      await onDelete(id);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      style={accentVars(color)}
      className="flex flex-col gap-3"
    >
      <Field label="Title">
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          required
          autoFocus
          autoComplete="off"
          className={inputClass}
        />
      </Field>

      <fieldset>
        <legend className="mb-1 text-xs text-ui-fg-muted">Category</legend>
        <div className="flex flex-wrap gap-1.5">
          {editable.map((category) => {
            const active = category.id === categoryId;

            return (
              <label
                key={category.id}
                style={accentVars(category.color)}
                className={`inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-full border px-2.5 text-xs transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ui-ring motion-reduce:transition-none ${
                  active
                    ? "border-[color-mix(in_oklab,var(--accent)_45%,transparent)] bg-[color-mix(in_oklab,var(--accent)_14%,transparent)] text-ui-fg"
                    : "border-ui-border text-ui-fg-muted hover:text-ui-fg"
                }`}
              >
                <input
                  type="radio"
                  name="category"
                  value={category.id}
                  checked={active}
                  onChange={() => setCategoryId(category.id)}
                  required
                  className="sr-only"
                />
                <span className="size-2 rounded-full bg-[var(--accent)]" />
                {category.name}
              </label>
            );
          })}
        </div>
      </fieldset>

      <div className="flex flex-col gap-1">
        <span id="event-date" className="text-xs text-ui-fg-muted">
          Date
        </span>
        <DatePicker value={day} onChange={setDay} labelledBy="event-date" />
      </div>

      <div className={fieldGridClass}>
        <Field label="Start">
          <TimeInput value={start} onChange={setStart} required />
        </Field>
        <Field label="End">
          <TimeInput value={end} onChange={setEnd} required />
        </Field>
      </div>

      {invalidTime && (
        <p role="alert" className="text-xs text-ui-danger">
          The end has to be after the start.
        </p>
      )}

      <Field label="Room">
        <input
          value={room}
          onChange={(event) => setRoom(event.target.value)}
          autoComplete="off"
          className={inputClass}
        />
      </Field>

      <Field label="Description">
        <textarea
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          rows={3}
          className={textareaClass}
        />
      </Field>

      <MarkPicker value={mark} onChange={setMark} />

      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          disabled={busy || invalidTime || title.trim() === "" || !categoryId}
          className={primaryButtonClass}
        >
          Save
        </button>
        <button type="button" onClick={onCancel} className={buttonClass}>
          Cancel
        </button>
        {draft.id && (
          <button
            type="button"
            onClick={() => remove(draft.id!)}
            disabled={busy}
            className={`${dangerButtonClass} ml-auto`}
          >
            Delete
          </button>
        )}
      </div>
    </form>
  );
}
