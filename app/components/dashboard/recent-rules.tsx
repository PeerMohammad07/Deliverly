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
    <s-section heading="Recent rules" padding="none">
      {rules.length > 0 ? (
        <s-link slot="secondary-actions" href="/app/rules">
          View all rules
        </s-link>
      ) : null}
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
        <s-empty-state heading="No delivery rules yet">
          <s-icon slot="graphic" type="calendar" />
          <s-text slot="subheading">
            Create a rule to start showing estimated delivery dates on your
            storefront.
          </s-text>
          <s-button
            slot="primary-action"
            variant="primary"
            href="/app/rules/new"
          >
            Create rule
          </s-button>
        </s-empty-state>
      )}
    </s-section>
  );
}
