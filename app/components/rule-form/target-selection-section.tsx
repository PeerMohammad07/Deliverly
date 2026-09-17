import type {
  RuleFormErrors,
  RuleTypeInput,
} from "../../validators/deliveryRule.validator";

interface TargetSelectionSectionProps {
  type: RuleTypeInput;
  selectedTargets: Array<{ id: string; title: string }>;
  pickerError: string | null;
  errors: RuleFormErrors;
  onTypeChange: (event: unknown) => void;
  onOpenPicker: () => void;
  onRemoveTarget: (id: string) => void;
}

export function TargetSelectionSection({
  type,
  selectedTargets,
  pickerError,
  errors,
  onTypeChange,
  onOpenPicker,
  onRemoveTarget,
}: TargetSelectionSectionProps) {
  return (
    <s-section heading="Targets">
      <s-stack direction="block" gap="base">
        <s-select
          label="Applies to"
          name="type"
          value={type}
          error={errors.type}
          onChange={onTypeChange}
        >
          <s-option value="DEFAULT">All products</s-option>
          <s-option value="PRODUCT">Specific products</s-option>
          <s-option value="COLLECTION">Specific collections</s-option>
        </s-select>
        {type === "DEFAULT" ? (
          <s-stack direction="block" gap="small-200">
            <s-box
              border="base"
              borderRadius="base"
              background="base"
              padding="small"
            >
              <s-stack
                direction="inline"
                gap="small-200"
                alignItems="center"
                justifyContent="space-between"
              >
                <span
                  style={{
                    fontSize: "14px",
                    fontWeight: 600,
                    color: "#202223",
                  }}
                >
                  All products
                </span>
                <s-badge tone="success">Selected</s-badge>
              </s-stack>
            </s-box>
            <div
              style={{
                display: "flex",
                gap: "8px",
                alignItems: "flex-start",
              }}
            >
              <span
                style={{
                  flexShrink: 0,
                  display: "inline-flex",
                  paddingTop: "2px",
                }}
              >
                <s-icon type="info" size="small" />
              </span>
              <span style={{ flex: "1 1 auto", minWidth: 0 }}>
                <s-paragraph color="subdued">
                  This default rule applies to all products without a more
                  specific rule. Priority: Product → Collection → Default.
                </s-paragraph>
              </span>
            </div>
          </s-stack>
        ) : (
          <s-stack direction="block" gap="small-200">
            <s-stack
              direction="inline"
              gap="small-200"
              alignItems="center"
              justifyContent="space-between"
            >
              <s-text type="strong">
                {selectedTargets.length === 0
                  ? type === "PRODUCT"
                    ? "No products selected"
                    : "No collections selected"
                  : selectedTargets.length === 1
                    ? type === "PRODUCT"
                      ? "1 product selected"
                      : "1 collection selected"
                    : type === "PRODUCT"
                      ? `${selectedTargets.length} products selected`
                      : `${selectedTargets.length} collections selected`}
              </s-text>
              <s-button
                type="button"
                variant="secondary"
                icon={type === "PRODUCT" ? "product" : "collection"}
                onClick={onOpenPicker}
              >
                {type === "PRODUCT" ? "Select products" : "Select collections"}
              </s-button>
            </s-stack>
            {selectedTargets.length > 0 ? (
              <s-stack direction="block" gap="small-100">
                {selectedTargets.map((target) => (
                  <s-box
                    key={target.id}
                    border="base"
                    borderRadius="base"
                    padding="small"
                    background="base"
                  >
                    <s-grid
                      gridTemplateColumns="minmax(0, 1fr) auto"
                      gap="small-200"
                      alignItems="center"
                    >
                      <s-paragraph>{target.title}</s-paragraph>
                      <s-button
                        type="button"
                        variant="tertiary"
                        tone="critical"
                        icon="delete"
                        accessibilityLabel={`Remove ${target.title}`}
                        onClick={() => onRemoveTarget(target.id)}
                      />
                    </s-grid>
                  </s-box>
                ))}
              </s-stack>
            ) : (
              <s-paragraph color="subdued">
                {type === "PRODUCT"
                  ? "Choose the products this delivery rule should apply to."
                  : "Choose the collections this delivery rule should apply to."}
              </s-paragraph>
            )}
            {pickerError ? (
              <s-paragraph tone="critical">{pickerError}</s-paragraph>
            ) : null}
            {errors.targetIds ? (
              <s-paragraph tone="critical">{errors.targetIds}</s-paragraph>
            ) : null}
          </s-stack>
        )}
      </s-stack>
    </s-section>
  );
}
