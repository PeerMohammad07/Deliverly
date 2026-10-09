interface OverviewCardsProps {
  totalRules: number;
  activeRules: number;
  targetedRules: number;
}

export function OverviewCards({
  totalRules,
  activeRules,
  targetedRules,
}: OverviewCardsProps) {
  return (
    <s-stack direction="block" gap="small-200">
      <s-heading>Overview</s-heading>
      <s-grid
        gridTemplateColumns="@container (inline-size <= 600px) 1fr, 1fr 1fr 1fr"
        gap="base"
      >
        <s-section padding="base">
          <s-stack direction="block" gap="small-100">
            <s-text type="strong">{totalRules}</s-text>
            <s-paragraph color="subdued">Total rules</s-paragraph>
          </s-stack>
        </s-section>
        <s-section padding="base">
          <s-stack direction="block" gap="small-100">
            <s-text type="strong">{activeRules}</s-text>
            <s-paragraph color="subdued">Active rules</s-paragraph>
          </s-stack>
        </s-section>
        <s-section padding="base">
          <s-stack direction="block" gap="small-100">
            <s-text type="strong">{targetedRules}</s-text>
            <s-paragraph color="subdued">Targeted rules</s-paragraph>
          </s-stack>
        </s-section>
      </s-grid>
    </s-stack>
  );
}
