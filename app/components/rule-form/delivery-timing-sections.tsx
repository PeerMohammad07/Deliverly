import type { RuleFormErrors } from "../../validators/deliveryRule.validator";

const WEEKDAYS = [
  { value: 0, label: "Sunday" },
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
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
  onExcludedChange: (days: number[]) => void;
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
  onExcludedChange,
}: DeliveryTimingSectionsProps) {
  return (
    <>
      <s-section heading="Delivery timing">
        <s-stack direction="block" gap="base">
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
              details="Business days to prepare an order before it ships."
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
              details="Fewest business days in transit."
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
              details="Most business days in transit."
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
          <s-choice-list
            label="Days you don’t deliver"
            name="excludedDays"
            multiple
            details="Estimates skip these days automatically."
            values={excluded.map(String)}
            error={errors.excludedDays}
            onChange={(event) =>
              onExcludedChange(
                event.currentTarget.values
                  .map(Number)
                  .filter((day) => Number.isInteger(day))
                  .sort((a, b) => a - b),
              )
            }
          >
            {WEEKDAYS.map((day) => (
              <s-choice key={day.value} value={String(day.value)}>
                {day.label}
              </s-choice>
            ))}
          </s-choice-list>
          <s-paragraph color="subdued">
            Delivery days: {deliveryDaysLabel}
          </s-paragraph>
        </s-stack>
      </s-section>
    </>
  );
}
