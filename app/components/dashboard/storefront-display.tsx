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
        <s-grid
          gridTemplateColumns="@container (inline-size <= 600px) 1fr, 1fr 1fr"
          gap="base"
        >
          <s-box
            padding="base"
            border="base"
            borderStyle="dashed"
            borderRadius="base"
          >
            <s-grid
              gridTemplateColumns="1fr auto"
              gap="base"
              alignItems="center"
            >
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
                  Enable the app embed to display ETA automatically.
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
          <div style={{ position: "relative" }}>
            <div
              style={{
                filter: "blur(1.5px)",
                opacity: 0.45,
                pointerEvents: "none",
                userSelect: "none",
              }}
            >
              <s-box
                padding="base"
                border="base"
                borderStyle="dashed"
                borderRadius="base"
              >
                <s-grid
                  gridTemplateColumns="1fr auto"
                  gap="base"
                  alignItems="center"
                >
                  <s-stack direction="block" gap="small-100">
                    <s-heading>App blocks</s-heading>
                    <s-paragraph color="subdued">
                      Place ETA blocks on product pages.
                    </s-paragraph>
                  </s-stack>
                  <s-button variant="secondary" disabled>
                    Manage
                  </s-button>
                </s-grid>
              </s-box>
            </div>
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <s-badge tone="info">Coming soon</s-badge>
            </div>
          </div>
        </s-grid>
      </s-box>
    </s-stack>
  );
}
