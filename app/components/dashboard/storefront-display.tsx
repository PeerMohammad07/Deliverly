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
    <s-stack direction="block" gap="small-200">
      <s-heading>Storefront display</s-heading>
      <s-box padding="base" background="base" border="base" borderRadius="base">
        <s-box
          padding="base"
          border="base"
          borderStyle="dashed"
          borderRadius="base"
        >
          <s-grid gridTemplateColumns="1fr auto" gap="base" alignItems="center">
            <s-stack direction="block" gap="small-100">
              <s-stack direction="inline" gap="small-200" alignItems="center">
                <s-heading>App embed</s-heading>
                <s-badge
                  tone={embedEnabled ? "success" : "warning"}
                  color="base"
                >
                  {embedEnabled ? "Active" : "Inactive"}
                </s-badge>
              </s-stack>
              <s-paragraph color="subdued">
                {embedEnabled
                  ? "Estimated delivery dates show on your product pages."
                  : "Enable the app embed to show estimated delivery dates on product pages."}
              </s-paragraph>
            </s-stack>
            <s-button
              variant="secondary"
              href={
                embedEnabled
                  ? (manageUrl ?? undefined)
                  : (editorUrl ?? undefined)
              }
              target="_blank"
            >
              {embedEnabled ? "Manage" : "Activate"}
            </s-button>
          </s-grid>
        </s-box>
      </s-box>
    </s-stack>
  );
}
