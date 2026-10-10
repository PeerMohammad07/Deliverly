import styles from "./dashboard.module.css";

interface OverviewCardsProps {
  totalRules: number;
  activeRules: number;
  defaultRules: number;
  productRules: number;
  collectionRules: number;
}

function MetricCard({
  label,
  value,
  detail,
  empty,
}: {
  label: string;
  value: number;
  detail: string;
  empty: boolean;
}) {
  const body = (
    <s-stack direction="block" gap="none">
      <s-stack
        direction="inline"
        alignItems="center"
        justifyContent="space-between"
        gap="small-200"
      >
        <s-text>
          <span className={styles.strong}>{label}</span>
        </s-text>
        {empty ? null : <s-icon type="chevron-right" size="small" />}
      </s-stack>
      <span
        className={`${styles.metricValue} ${empty ? styles.metricValueEmpty : ""}`}
      >
        {value}
      </span>
      <s-text color="subdued">{detail}</s-text>
    </s-stack>
  );

  // With rules, each card opens the rules list; empty cards aren't links.
  return (
    <s-section padding="none">
      {empty ? (
        <s-box padding="base">{body}</s-box>
      ) : (
        <s-clickable
          href="/app/rules"
          padding="base"
          accessibilityLabel={`${label}: ${value}. View rules`}
        >
          {body}
        </s-clickable>
      )}
    </s-section>
  );
}

export function OverviewCards({
  totalRules,
  activeRules,
  defaultRules,
  productRules,
  collectionRules,
}: OverviewCardsProps) {
  const empty = totalRules === 0;
  const targeted = productRules + collectionRules;
  const noRules = "No rules yet";

  return (
    <s-grid
      gridTemplateColumns="@container (inline-size <= 600px) 1fr, 1fr 1fr 1fr"
      gap="base"
    >
      <MetricCard
        label="Total rules"
        value={totalRules}
        empty={empty}
        detail={
          empty ? noRules : `${defaultRules} default · ${targeted} targeted`
        }
      />
      <MetricCard
        label="Active rules"
        value={activeRules}
        empty={empty}
        detail={empty ? noRules : `${totalRules - activeRules} inactive`}
      />
      <MetricCard
        label="Targeted rules"
        value={targeted}
        empty={empty}
        detail={
          empty
            ? noRules
            : `${productRules} product · ${collectionRules} collection`
        }
      />
    </s-grid>
  );
}
