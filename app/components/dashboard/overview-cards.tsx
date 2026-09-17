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
            <s-heading>{totalRules}</s-heading>
            <s-paragraph color="subdued">Total rules</s-paragraph>
          </s-stack>
        </s-section>
        <s-section padding="base">
          <s-stack direction="block" gap="small-100">
            <s-heading>{activeRules}</s-heading>
            <s-paragraph color="subdued">Active rules</s-paragraph>
          </s-stack>
        </s-section>
        <s-section padding="base">
          <s-stack direction="block" gap="small-100">
            <s-heading>{targetedRules}</s-heading>
            <s-paragraph color="subdued">Targeted rules</s-paragraph>
          </s-stack>
        </s-section>
      </s-grid>
    </s-stack>
  );
}
