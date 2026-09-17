import { type StorefrontDateStyle } from "../../utils/delivery-dates";
import type { RuleFormErrors } from "../../validators/deliveryRule.validator";

interface StorefrontMessageSectionProps {
  msgPrefix: string;
  msgSeparator: string;
  msgSuffix: string;
  dateStyle: StorefrontDateStyle;
  etaText: string;
  errors: RuleFormErrors;
  onPrefixInput: (event: unknown) => void;
  onSeparatorInput: (event: unknown) => void;
  onSuffixInput: (event: unknown) => void;
  onDateStyleChange: (event: unknown) => void;
  onReset: () => void;
}

export function StorefrontMessageSection({
  msgPrefix,
  msgSeparator,
  msgSuffix,
  dateStyle,
  etaText,
  errors,
  onPrefixInput,
  onSeparatorInput,
  onSuffixInput,
  onDateStyleChange,
  onReset,
}: StorefrontMessageSectionProps) {
  return (
    <s-section heading="Storefront message">
      <s-stack direction="block" gap="base">
        <s-text-field
          label="Opening text"
          name="msgPrefix"
          details="Shown before the delivery dates."
          maxLength={120}
          autocomplete="off"
          value={msgPrefix}
          error={errors.msgPrefix}
          onInput={onPrefixInput}
        />
        <s-grid
          gridTemplateColumns="@container (inline-size <= 560px) 1fr, 1fr 1fr"
          gap="base"
        >
          <s-text-field
            label="Text between dates"
            name="msgSeparator"
            maxLength={10}
            autocomplete="off"
            value={msgSeparator}
            error={errors.msgSeparator}
            onInput={onSeparatorInput}
          />
          <s-text-field
            label="Closing text (optional)"
            name="msgSuffix"
            maxLength={200}
            autocomplete="off"
            value={msgSuffix}
            error={errors.msgSuffix}
            onInput={onSuffixInput}
          />
        </s-grid>
        <s-select
          label="Date style"
          name="dateStyle"
          details="How the earliest and latest dates look."
          value={dateStyle}
          error={errors.dateStyle}
          onChange={onDateStyleChange}
        >
          <s-option value="long">September 17</s-option>
          <s-option value="ordinal">Sept 17th</s-option>
          <s-option value="short">Sep 17</s-option>
          <s-option value="weekday">Fri, Sep 17</s-option>
        </s-select>
        <s-box
          background="subdued"
          border="base"
          borderRadius="base"
          padding="small"
        >
          <s-stack direction="block" gap="small-100">
            <s-paragraph color="subdued">Preview</s-paragraph>
            <s-text type="strong">{etaText}</s-text>
          </s-stack>
        </s-box>
        <s-stack direction="inline" gap="small-200">
          <s-button
            type="button"
            variant="tertiary"
            icon="reset"
            onClick={onReset}
          >
            Reset
          </s-button>
        </s-stack>
      </s-stack>
    </s-section>
  );
}
