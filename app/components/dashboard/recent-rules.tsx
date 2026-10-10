import styles from "./dashboard.module.css";

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
}

export function RecentRules({ rules, loading }: RecentRulesProps) {
  return (
    <s-section padding="none">
      <s-box padding="base">
        <s-stack
          direction="inline"
          alignItems="center"
          justifyContent="space-between"
          gap="base"
        >
          <s-heading>Recent rules</s-heading>
          {rules.length > 0 ? (
            <s-link href="/app/rules">View all rules</s-link>
          ) : null}
        </s-stack>
      </s-box>
      <s-divider />
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
                  <s-stack
                    direction="inline"
                    gap="small-200"
                    alignItems="center"
                  >
                    <s-text>
                      <span className={styles.strong}>{rule.name}</span>
                    </s-text>
                    <s-badge>{rule.kind}</s-badge>
                  </s-stack>
                </s-table-cell>
                <s-table-cell>
                  <s-text>{rule.targets}</s-text>
                </s-table-cell>
                <s-table-cell>
                  <s-text>
                    <span className={styles.strong}>{rule.eta}</span>
                  </s-text>
                </s-table-cell>
                <s-table-cell>
                  <s-badge tone={rule.enabled ? "success" : undefined}>
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
                Create a rule to start showing estimated delivery dates on your
                storefront.
              </s-paragraph>
            </s-stack>
            <s-button variant="secondary" href="/app/rules/new">
              Create rule
            </s-button>
          </s-stack>
        </s-box>
      )}
    </s-section>
  );
}
