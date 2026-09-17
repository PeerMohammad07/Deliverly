import type { RuleFormErrors } from "../../validators/deliveryRule.validator";

const WEEKDAYS = [
  { value: 0, short: "Sun" },
  { value: 1, short: "Mon" },
  { value: 2, short: "Tue" },
  { value: 3, short: "Wed" },
  { value: 4, short: "Thu" },
  { value: 5, short: "Fri" },
  { value: 6, short: "Sat" },
];

interface DeliveryTimingSectionsProps {
  processingDays: string;
  minDays: string;
  maxDays: string;
  excluded: number[];
  deliveryDaysLabel: string;
  minGreaterThanMax: boolean;
  errors: RuleFormErrors;
  onProcessingDaysInput: (event: unknown) => void;
  onMinDaysInput: (event: unknown) => void;
  onMaxDaysInput: (event: unknown) => void;
  onToggleDay: (day: number) => void;
}

export function DeliveryTimingSections({
  processingDays,
  minDays,
  maxDays,
  excluded,
  deliveryDaysLabel,
  minGreaterThanMax,
  errors,
  onProcessingDaysInput,
  onMinDaysInput,
  onMaxDaysInput,
  onToggleDay,
}: DeliveryTimingSectionsProps) {
  return (
    <>
      <s-section heading="Delivery timing">
        <s-stack direction="block" gap="base">
          <s-paragraph color="subdued">
            Ticked days below are skipped.
          </s-paragraph>
          <s-grid
            gridTemplateColumns="@container (inline-size <= 560px) 1fr, 1fr 1fr 1fr"
            gap="base"
          >
            <s-number-field
              label="Processing"
              name="processingDays"
              suffix="days"
              min={0}
              max={30}
              step={1}
              inputMode="numeric"
              details="Prep time."
              value={processingDays}
              error={errors.processingDays}
              onInput={onProcessingDaysInput}
            />
            <s-number-field
              label="Min shipping"
              name="minDeliveryDays"
              suffix="days"
              min={0}
              max={60}
              step={1}
              inputMode="numeric"
              details="Fastest."
              value={minDays}
              error={errors.minDeliveryDays}
              onInput={onMinDaysInput}
            />
            <s-number-field
              label="Max shipping"
              name="maxDeliveryDays"
              suffix="days"
              min={0}
              max={60}
              step={1}
              inputMode="numeric"
              details="Slowest."
              value={maxDays}
              error={errors.maxDeliveryDays}
              onInput={onMaxDaysInput}
            />
          </s-grid>
          {minGreaterThanMax ? (
            <s-paragraph tone="critical">
              Max shipping must be the same or later than min.
            </s-paragraph>
          ) : null}
        </s-stack>
      </s-section>

      <s-section heading="Days excluded from delivery">
        <s-stack direction="block" gap="base">
          <s-paragraph color="subdued">
            Tick days you don’t deliver. Estimates skip them automatically.
          </s-paragraph>
          <div
            role="group"
            aria-label="Days you don't deliver"
            style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}
          >
            {WEEKDAYS.map((day) => {
              const off = excluded.includes(day.value);
              return (
                <button
                  key={day.value}
                  type="button"
                  aria-pressed={off}
                  onClick={() => onToggleDay(day.value)}
                  style={{
                    border: off ? "1px solid #1a1a1a" : "1px solid #dfe1e6",
                    borderRadius: "999px",
                    padding: "9px 14px",
                    minWidth: "64px",
                    textAlign: "center",
                    fontSize: "13px",
                    fontWeight: 600,
                    cursor: "pointer",
                    background: off ? "#1a1a1a" : "#ffffff",
                    color: off ? "#ffffff" : "#202223",
                  }}
                >
                  {off ? `✓ ${day.short}` : day.short}
                </button>
              );
            })}
          </div>
          {errors.excludedDays ? (
            <s-paragraph tone="critical">{errors.excludedDays}</s-paragraph>
          ) : null}
          <s-paragraph color="subdued">
            📅 Delivery days: {deliveryDaysLabel}
          </s-paragraph>
        </s-stack>
      </s-section>
    </>
  );
}
