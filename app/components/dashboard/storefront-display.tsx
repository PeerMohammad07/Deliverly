import styles from "./dashboard.module.css";

interface StorefrontDisplayProps {
  embedEnabled: boolean;
  editorUrl: string | null;
  manageUrl: string | null;
}

export function StorefrontDisplay({
  embedEnabled,
  editorUrl,
  manageUrl,
}: StorefrontDisplayProps) {
  return (
    <s-section heading="Storefront display">
      <s-stack direction="block" gap="base">
        <s-box padding="small-100" background="subdued" borderRadius="base">
          <s-box padding="small-200">
            <s-stack direction="block" gap="small-200">
              <s-stack direction="inline" gap="small-200" alignItems="center">
                <s-text>
                  <span className={styles.strong}>App embed</span>
                </s-text>
                <s-badge tone={embedEnabled ? "success" : "warning"}>
                  {embedEnabled ? "Active" : "Inactive"}
                </s-badge>
              </s-stack>
              <s-paragraph color="subdued">
                {embedEnabled
                  ? "Estimated delivery dates show on your product pages."
                  : "Turn on the app embed to show estimated delivery dates on product pages."}
              </s-paragraph>
            </s-stack>
          </s-box>
        </s-box>
        <s-stack direction="inline">
          <s-button
            variant="secondary"
            href={
              embedEnabled ? (manageUrl ?? undefined) : (editorUrl ?? undefined)
            }
            target="_blank"
          >
            {embedEnabled ? "Manage in theme editor" : "Activate"}
          </s-button>
        </s-stack>
      </s-stack>
    </s-section>
  );
}
