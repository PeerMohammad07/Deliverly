import styles from "./dashboard.module.css";

const PRIORITY = [
  { label: "Product rules" },
  { label: "Collection rules" },
  { label: "All products", badge: "Default" },
];

export function RulePriority() {
  return (
    <s-section heading="How rules are applied">
      <s-stack direction="block" gap="base">
        <s-paragraph color="subdued">
          If a product matches more than one rule, the most specific one wins.
        </s-paragraph>
        <ol
          className={styles.priorityList}
          aria-label="Rule priority, highest first"
        >
          {PRIORITY.map((item, index) => (
            <li key={item.label}>
              <s-stack direction="inline" gap="small-200" alignItems="center">
                <span className={styles.stepNumber} aria-hidden="true">
                  {index + 1}
                </span>
                <s-text>{item.label}</s-text>
                {item.badge ? (
                  <s-badge tone="info">{item.badge}</s-badge>
                ) : null}
              </s-stack>
            </li>
          ))}
        </ol>
      </s-stack>
    </s-section>
  );
}
