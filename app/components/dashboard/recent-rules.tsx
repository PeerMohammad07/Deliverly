interface RecentRule {
  id: string;
  name: string;
  kind: string;
  targets: string;
  eta: string;
  enabled: boolean;
}

interface RecentRulesProps {
  rules: RecentRule[];
  loading: boolean;
  onViewAll: () => void;
}

export function RecentRules({ rules, loading, onViewAll }: RecentRulesProps) {
  return (
    <s-stack direction="block" gap="small-200">
      <s-stack
        direction="inline"
        alignItems="center"
        justifyContent="space-between"
        gap="base"
      >
        <s-heading>Recent rules</s-heading>
        {rules.length > 0 ? (
          <s-button variant="secondary" onClick={onViewAll} loading={loading}>
            View all rules
          </s-button>
        ) : null}
      </s-stack>
      <s-box
        border="base"
        borderRadius="base"
        background="base"
        overflow="hidden"
      >
        {rules.length > 0 ? (
          <s-table variant="auto" loading={loading}>
            <s-table-header-row>
              <s-table-header listSlot="primary">Rule</s-table-header>
              <s-table-header listSlot="labeled">Applies to</s-table-header>
              <s-table-header listSlot="labeled">Delivery time</s-table-header>
              <s-table-header listSlot="inline">Status</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {rules.map((rule) => (
                <s-table-row key={rule.id}>
                  <s-table-cell>
                    <s-stack direction="block" gap="none">
                      <s-text type="strong">{rule.name}</s-text>
                      <s-paragraph color="subdued">{rule.kind}</s-paragraph>
                    </s-stack>
                  </s-table-cell>
                  <s-table-cell>
                    <s-paragraph>{rule.targets}</s-paragraph>
                  </s-table-cell>
                  <s-table-cell>
                    <s-text type="strong">{rule.eta}</s-text>
                  </s-table-cell>
                  <s-table-cell>
                    <s-badge
                      tone={rule.enabled ? "success" : undefined}
                      color="base"
                    >
                      {rule.enabled ? "Active" : "Inactive"}
                    </s-badge>
                  </s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        ) : (
          <s-box padding="large">
            <s-stack direction="block" gap="base" alignItems="center">
              <s-box padding="small" background="subdued" borderRadius="base">
                <s-icon type="calendar" />
              </s-box>
              <s-stack direction="block" gap="small-100" alignItems="center">
                <s-heading>No delivery rules yet</s-heading>
                <s-paragraph color="subdued">
                  Create a rule to start showing estimated delivery dates on
                  your storefront.
                </s-paragraph>
              </s-stack>
              <s-button variant="primary" icon="plus" href="/app/rules/new">
                Create rule
              </s-button>
            </s-stack>
          </s-box>
        )}
      </s-box>
    </s-stack>
  );
}
