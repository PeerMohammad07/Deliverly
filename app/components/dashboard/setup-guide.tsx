import type { CSSProperties } from "react";

const SECTION_HEADING: CSSProperties = {
  margin: "0",
  fontSize: "15px",
  fontWeight: 650,
  lineHeight: "22px",
  color: "#202223",
};

interface SetupGuideProps {
  hidden: boolean;
  open: boolean;
  step: number;
  completedSteps: number;
  embedEnabled: boolean;
  hasRule: boolean;
  etaConfirmed: boolean;
  checking: boolean;
  editorUrl: string | null;
  onDismiss: () => void;
  onToggleOpen: () => void;
  onStepChange: (step: number) => void;
  onCheckStatus: () => void;
  onViewRules: () => void;
  onConfirmEta: () => void;
}

export function SetupGuide({
  hidden,
  open,
  step,
  completedSteps,
  embedEnabled,
  hasRule,
  etaConfirmed,
  checking,
  editorUrl,
  onDismiss,
  onToggleOpen,
  onStepChange,
  onCheckStatus,
  onViewRules,
  onConfirmEta,
}: SetupGuideProps) {
  if (hidden) return null;

  return (
    <s-box border="base" borderRadius="base" background="base" padding="base">
      <s-stack direction="block" gap="small-200">
        <s-stack
          direction="inline"
          alignItems="center"
          justifyContent="space-between"
          gap="small-200"
        >
          <h2
            style={{
              ...SECTION_HEADING,
              fontSize: "16px",
              lineHeight: "24px",
            }}
          >
            Setup guide
          </h2>
          <s-stack direction="inline" gap="small-100" alignItems="center">
            <s-button
              commandFor="setup-menu"
              variant="tertiary"
              tone="neutral"
              icon="menu-horizontal"
              accessibilityLabel="More actions"
            />
            <s-menu id="setup-menu" accessibilityLabel="Setup guide actions">
              <s-button variant="tertiary" onClick={onDismiss}>
                Dismiss
              </s-button>
            </s-menu>
            <s-button
              variant="tertiary"
              tone="neutral"
              icon={open ? "chevron-up" : "chevron-down"}
              accessibilityLabel="Toggle setup guide"
              onClick={onToggleOpen}
            />
          </s-stack>
        </s-stack>
        <s-stack direction="block" gap="small-100">
          <s-paragraph color="subdued">
            Get started with the app in just a few simple steps!
          </s-paragraph>
          <s-badge>{completedSteps} / 3 completed</s-badge>
        </s-stack>
        {open ? (
          <s-stack direction="block" gap="none">
            <s-box
              padding={step === 1 ? "small" : "small-200"}
              borderRadius="base"
              background={step === 1 ? "subdued" : undefined}
            >
              <s-stack direction="block" gap="small-200">
                <s-clickable onClick={() => onStepChange(1)}>
                  <s-stack
                    direction="inline"
                    gap="small-200"
                    alignItems="center"
                  >
                    {embedEnabled ? (
                      <s-icon type="check-circle-filled" />
                    ) : (
                      <s-icon type="circle-dashed" />
                    )}
                    <s-heading>Enable theme app embed block</s-heading>
                  </s-stack>
                </s-clickable>
                {step === 1 ? (
                  embedEnabled ? (
                    <s-stack direction="block" gap="small-200">
                      <s-paragraph color="subdued">
                        The Deliverly ETA app embed is enabled on your published
                        theme.
                      </s-paragraph>
                      <s-button
                        variant="secondary"
                        href={editorUrl ?? undefined}
                        target="_blank"
                      >
                        Open theme editor
                      </s-button>
                    </s-stack>
                  ) : (
                    <s-stack direction="block" gap="small-200">
                      <s-paragraph color="subdued">
                        To start using the app, please enable app embedding by
                        following the steps below.
                      </s-paragraph>
                      <s-unordered-list>
                        <s-list-item>
                          <s-text color="subdued">
                            Click &quot;Enable embed app&quot; below.
                          </s-text>
                        </s-list-item>
                        <s-list-item>
                          <s-text color="subdued">
                            Find and enable &quot;Estimated Delivery Date&quot;
                            in the theme customizer.
                          </s-text>
                        </s-list-item>
                        <s-list-item>
                          <s-text color="subdued">
                            Click &quot;Save&quot; and reload this page.
                          </s-text>
                        </s-list-item>
                      </s-unordered-list>
                      <s-stack
                        direction="inline"
                        gap="small-200"
                        alignItems="center"
                      >
                        <s-button
                          variant="secondary"
                          href={editorUrl ?? undefined}
                          target="_blank"
                        >
                          Enable embed app
                        </s-button>
                        <s-button
                          variant="tertiary"
                          onClick={onCheckStatus}
                          loading={checking}
                        >
                          Check status
                        </s-button>
                      </s-stack>
                    </s-stack>
                  )
                ) : null}
              </s-stack>
            </s-box>
            <s-box
              padding={step === 2 ? "small" : "small-200"}
              borderRadius="base"
              background={step === 2 ? "subdued" : undefined}
            >
              <s-stack direction="block" gap="small-200">
                <s-clickable onClick={() => onStepChange(2)}>
                  <s-stack
                    direction="inline"
                    gap="small-200"
                    alignItems="center"
                  >
                    {hasRule ? (
                      <s-icon type="check-circle-filled" />
                    ) : (
                      <s-icon type="circle-dashed" />
                    )}
                    <s-heading>Create a rule</s-heading>
                  </s-stack>
                </s-clickable>
                {step === 2 ? (
                  hasRule ? (
                    <s-stack direction="block" gap="small-200">
                      <s-paragraph color="subdued">
                        A delivery rule is set up for your store.
                      </s-paragraph>
                      <s-button variant="secondary" onClick={onViewRules}>
                        View rules
                      </s-button>
                    </s-stack>
                  ) : (
                    <s-stack direction="block" gap="small-200">
                      <s-paragraph color="subdued">
                        Create a delivery rule to start showing estimated dates
                        on your storefront.
                      </s-paragraph>
                      <s-button variant="primary" href="/app/rules/new">
                        Create rule
                      </s-button>
                    </s-stack>
                  )
                ) : null}
              </s-stack>
            </s-box>
            <s-box
              padding={step === 3 ? "small" : "small-200"}
              borderRadius="base"
              background={step === 3 ? "subdued" : undefined}
            >
              <s-stack direction="block" gap="small-200">
                <s-clickable onClick={() => onStepChange(3)}>
                  <s-stack
                    direction="inline"
                    gap="small-200"
                    alignItems="center"
                  >
                    {etaConfirmed ? (
                      <s-icon type="check-circle-filled" />
                    ) : (
                      <s-icon type="circle-dashed" />
                    )}
                    <s-heading>Confirm ETA Display</s-heading>
                  </s-stack>
                </s-clickable>
                {step === 3 ? (
                  <s-stack direction="block" gap="small-200">
                    <s-paragraph color="subdued">
                      {etaConfirmed
                        ? "ETA display is confirmed for your store."
                        : "Confirm your store to ensure the estimated delivery date is displaying correctly as expected. Get in touch if you need any tweaks."}
                    </s-paragraph>
                    {etaConfirmed ? (
                      <s-button variant="secondary">Contact support</s-button>
                    ) : (
                      <s-button-group>
                        <s-button
                          slot="primary-action"
                          variant="primary"
                          onClick={onConfirmEta}
                        >
                          Yay, Its working 😁
                        </s-button>
                        <s-button slot="secondary-actions" variant="secondary">
                          Contact support
                        </s-button>
                      </s-button-group>
                    )}
                  </s-stack>
                ) : null}
              </s-stack>
            </s-box>
          </s-stack>
        ) : null}
      </s-stack>
    </s-box>
  );
}
