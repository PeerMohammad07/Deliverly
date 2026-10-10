import styles from "./rules.module.css";

const ORDER = ["Product rules", "Collection rules", "All products"];

export function RulePriorityBar() {
  return (
    <s-section padding="base" accessibilityLabel="Rule priority">
      <div className={styles.priority}>
        <s-icon type="info" size="small" />
        <s-text>
          <span className={styles.strong}>Rule priority</span>
        </s-text>
        <s-text color="subdued">
          — when rules overlap, the most specific wins:
        </s-text>
        <ol
          className={`${styles.priority} ${styles.priorityList}`}
          aria-label="Rule priority, highest first"
        >
          {ORDER.map((label, index) => (
            <li key={label} className={styles.priorityItem}>
              {index > 0 ? <s-icon type="arrow-right" size="small" /> : null}
              <span className={styles.priorityChip}>{label}</span>
            </li>
          ))}
        </ol>
      </div>
    </s-section>
  );
}
