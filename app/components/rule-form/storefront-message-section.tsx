import {
  COUNTDOWN_TOKEN,
  type StorefrontDateStyle,
} from "../../utils/delivery-dates";
import type { RuleFormErrors } from "../../validators/deliveryRule.validator";

interface StorefrontMessageSectionProps {
  msgPrefix: string;
  msgSeparator: string;
  msgSuffix: string;
  dateStyle: StorefrontDateStyle;
  hasCutoff: boolean;
  countdown: boolean;
  countdownPrefix: string;
  errors: RuleFormErrors;
  onPrefixInput: (event: unknown) => void;
  onSeparatorInput: (event: unknown) => void;
  onSuffixInput: (event: unknown) => void;
  onDateStyleChange: (event: unknown) => void;
  onCountdownChange: (enabled: boolean) => void;
  onCountdownPrefixInput: (event: unknown) => void;
  onCopyCountdownToken: () => void;
  onReset: () => void;
}

export function StorefrontMessageSection({
  msgPrefix,
  msgSeparator,
  msgSuffix,
  dateStyle,
  hasCutoff,
  countdown,
  countdownPrefix,
  errors,
  onPrefixInput,
  onSeparatorInput,
  onSuffixInput,
  onDateStyleChange,
  onCountdownChange,
  onCountdownPrefixInput,
  onCopyCountdownToken,
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
        <s-divider />
        <s-stack direction="block" gap="base">
          <s-switch
            label="Show a countdown before the cutoff"
            details="Before your store’s cutoff, the opening text below is used instead, in the same sentence as the dates. After the cutoff, the normal message shows."
            checked={countdown}
            onChange={(event) => onCountdownChange(event.currentTarget.checked)}
          />
          {countdown ? (
            <s-stack direction="block" gap="small-200">
              <s-text-field
                label="Opening text before the cutoff"
                name="countdownPrefix"
                details={`${COUNTDOWN_TOKEN} is replaced with the time left, like 3h 20m. The dates follow, as in the normal message.`}
                maxLength={120}
                autocomplete="off"
                value={countdownPrefix}
                error={errors.countdownPrefix}
                onInput={onCountdownPrefixInput}
              />
              <s-stack direction="inline" gap="small-200">
                <s-button
                  type="button"
                  variant="tertiary"
                  icon="clipboard"
                  onClick={onCopyCountdownToken}
                >
                  Copy {COUNTDOWN_TOKEN}
                </s-button>
              </s-stack>
              {hasCutoff ? null : (
                <s-banner tone="warning">
                  Your store has no order cutoff, so the countdown won’t show
                  yet. <s-link href="/app/settings">Set a cutoff</s-link>
                </s-banner>
              )}
            </s-stack>
          ) : null}
        </s-stack>
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
