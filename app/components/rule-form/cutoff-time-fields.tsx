import type { CutoffPeriod } from "../../utils/delivery-dates";

export interface CutoffFieldsValue {
  hour: string;
  minute: string;
  period: CutoffPeriod;
}

function isIntBetween(value: string, min: number, max: number): boolean {
  const n = value.trim() === "" ? NaN : Number(value);
  return Number.isInteger(n) && n >= min && n <= max;
}

/** Instant per-field hints while the merchant types. */
function cutoffFieldErrors(value: CutoffFieldsValue) {
  return {
    hour: isIntBetween(value.hour, 1, 12)
      ? undefined
      : "Enter an hour from 1 to 12.",
    minute: isIntBetween(value.minute, 0, 59)
      ? undefined
      : "Enter minutes from 0 to 59.",
  };
}

/** Hour, minutes and AM/PM in one row, under a single visible label. */
export function CutoffTimeFields({
  value,
  timeZone,
  error,
  onChange,
}: {
  value: CutoffFieldsValue;
  timeZone: string;
  /** Error for the time as a whole, e.g. 12:00 AM. */
  error?: string;
  onChange: (next: CutoffFieldsValue) => void;
}) {
  const fieldErrors = cutoffFieldErrors(value);
  const read = (event: Event) =>
    (event.currentTarget as HTMLInputElement | null)?.value ?? "";

  return (
    <s-stack direction="block" gap="small-200">
      <s-text>Cutoff time</s-text>
      <s-grid gridTemplateColumns="1fr 1fr 1fr" gap="small-200">
        <s-number-field
          label="Cutoff hour"
          labelAccessibilityVisibility="exclusive"
          placeholder="12"
          min={1}
          max={12}
          step={1}
          inputMode="numeric"
          value={value.hour}
          error={fieldErrors.hour ?? error}
          onInput={(event) => onChange({ ...value, hour: read(event) })}
        />
        <s-number-field
          label="Cutoff minutes"
          labelAccessibilityVisibility="exclusive"
          placeholder="00"
          min={0}
          max={59}
          step={1}
          inputMode="numeric"
          value={value.minute}
          error={fieldErrors.minute}
          onInput={(event) => onChange({ ...value, minute: read(event) })}
        />
        <s-select
          label="Cutoff AM or PM"
          labelAccessibilityVisibility="exclusive"
          value={value.period}
          onChange={(event) =>
            onChange({
              ...value,
              period: read(event) === "AM" ? "AM" : "PM",
            })
          }
        >
          <s-option value="AM">AM</s-option>
          <s-option value="PM">PM</s-option>
        </s-select>
      </s-grid>
      <s-text color="subdued">Uses your store’s time zone ({timeZone}).</s-text>
    </s-stack>
  );
}
