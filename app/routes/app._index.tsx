import { useEffect, useState } from "react";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import type { HeadersFunction, LoaderFunctionArgs } from "react-router";

const stats = [
  { label: "Total rules", value: 12 },
  { label: "Active rules", value: 9 },
  { label: "Product rules", value: 5 },
  { label: "Collection rules", value: 3 },
];

const recentRules = [
  { name: "Default US", type: "Default", eta: "3–5 days", status: "Active" },
  { name: "Express UK", type: "Product", eta: "1–2 days", status: "Active" },
  { name: "Summer sale", type: "Collection", eta: "5–8 days", status: "Paused" },
];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return null;
};

export default function Dashboard() {
  const [hidden, setHidden] = useState(false);
  const [open, setOpen] = useState(true);
  const [step, setStep] = useState(3);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 800);
    return () => clearTimeout(timer);
  }, []);

  return (
    <s-page>
      <s-stack
          direction="inline"
          alignItems="center"
          justifyContent="space-between"
          gap="base"
        >
      <h1
            style={{
              margin: "0",
              fontSize: "20px",
              fontWeight: 700,
              lineHeight: "28px",
              letterSpacing: "-0.02em",
              color: "#202223",
            }}
          >
            Dashboard
          </h1>
          </s-stack>
      {!hidden ? (
        <s-section heading="Setup guide">
          <s-button
            slot="secondary-actions"
            commandFor="setup-menu"
            variant="tertiary"
            tone="neutral"
            icon="menu-horizontal"
            accessibilityLabel="More actions"
          />
          <s-menu id="setup-menu" accessibilityLabel="Setup guide actions">
            <s-button variant="tertiary" onClick={() => setHidden(true)}>
              Dismiss
            </s-button>
          </s-menu>
          <s-button
            slot="secondary-actions"
            variant="tertiary"
            tone="neutral"
            icon={open ? "chevron-up" : "chevron-down"}
            accessibilityLabel="Toggle setup guide"
            onClick={() => setOpen(!open)}
          />
          <s-stack direction="block" gap="small-200">
            <s-paragraph color="subdued">
              Get started in a few steps so customers see the right delivery
              estimate.
            </s-paragraph>
            {open ? (
              <s-stack direction="block" gap="small-100">
                <s-badge>2 / 3 completed</s-badge>
                <s-box
                  padding={step === 1 ? "small" : "none"}
                  borderRadius="base"
                  background={step === 1 ? "subdued" : undefined}
                >
                  <s-stack direction="block" gap="small-200">
                    <s-clickable onClick={() => setStep(1)}>
                      <s-stack
                        direction="inline"
                        gap="small-200"
                        alignItems="center"
                      >
                        <s-icon type="circle-dashed" />
                        <s-text type={step === 1 ? "strong" : undefined}>
                          Enable theme app embed block
                        </s-text>
                      </s-stack>
                    </s-clickable>
                    {step === 1 ? (
                      <s-stack direction="block" gap="small-200">
                        <s-paragraph>
                          Enable app embedding in the theme customizer, save,
                          then reload this page.
                        </s-paragraph>
                        <s-button variant="primary">Enable embed app</s-button>
                      </s-stack>
                    ) : null}
                  </s-stack>
                </s-box>
                <s-box
                  padding={step === 2 ? "small" : "none"}
                  borderRadius="base"
                  background={step === 2 ? "subdued" : undefined}
                >
                  <s-clickable onClick={() => setStep(2)}>
                    <s-stack
                      direction="inline"
                      gap="small-200"
                      alignItems="center"
                    >
                      <s-icon type="check-circle-filled" />
                      <s-text type={step === 2 ? "strong" : undefined}>
                        Activate app
                      </s-text>
                    </s-stack>
                  </s-clickable>
                  {step === 2 ? (
                    <s-paragraph>
                      The app is active. Estimated delivery dates can show on
                      your store.
                    </s-paragraph>
                  ) : null}
                </s-box>
                <s-box
                  padding={step === 3 ? "small" : "none"}
                  borderRadius="base"
                  background={step === 3 ? "subdued" : undefined}
                >
                  <s-stack direction="block" gap="small-200">
                    <s-clickable onClick={() => setStep(3)}>
                      <s-stack
                        direction="inline"
                        gap="small-200"
                        alignItems="center"
                      >
                        <s-icon type="check-circle-filled" />
                        <s-text type={step === 3 ? "strong" : undefined}>
                          Confirm ETA Display
                        </s-text>
                      </s-stack>
                    </s-clickable>
                    {step === 3 ? (
                      <s-stack direction="block" gap="small-200">
                        <s-paragraph>
                          Check a product page to confirm the estimated delivery
                          date looks right.
                        </s-paragraph>
                        <s-button-group>
                          <s-button slot="primary-action">
                            Yay, Its working 😎
                          </s-button>
                          <s-button slot="secondary-actions">
                            Contact support
                          </s-button>
                        </s-button-group>
                      </s-stack>
                    ) : null}
                  </s-stack>
                </s-box>
              </s-stack>
            ) : null}
          </s-stack>
        </s-section>
      ) : null}

      <s-section heading="Overview">
        <s-grid
          gridTemplateColumns="@container (inline-size <= 600px) 1fr 1fr, 1fr 1fr 1fr 1fr"
          gap="small-200"
        >
          {stats.map((stat) => (
            <s-box
              key={stat.label}
              background="subdued"
              borderRadius="base"
              padding="small"
            >
              <s-stack direction="block" gap="small-100">
                <s-paragraph color="subdued">{stat.label}</s-paragraph>
                {loading ? (
                  <s-spinner accessibilityLabel="Loading" />
                ) : (
                  <s-heading>{stat.value}</s-heading>
                )}
              </s-stack>
            </s-box>
          ))}
        </s-grid>
      </s-section>

      <s-section heading="Recent rules" padding="none">
        <s-button
          slot="primary-action"
          variant="primary"
          href="/app/rules/new"
        >
          Create rule
        </s-button>
        <s-button slot="secondary-actions" href="/app/rules">
          View all rules
        </s-button>
        {loading ? (
          <s-box padding="large">
            <s-stack direction="block" gap="small-200" alignItems="center">
              <s-spinner accessibilityLabel="Loading rules" />
              <s-paragraph color="subdued">Loading rules</s-paragraph>
            </s-stack>
          </s-box>
        ) : (
          <div style={{ overflowX: "auto", maxWidth: "100%" }}>
            <div style={{ minWidth: "480px" }}>
              <s-table variant="auto">
            <s-table-header-row>
              <s-table-header listSlot="primary">Rule</s-table-header>
              <s-table-header listSlot="labeled">Type</s-table-header>
              <s-table-header listSlot="labeled">Delivery</s-table-header>
              <s-table-header listSlot="inline">Status</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {recentRules.map((rule) => (
                <s-table-row key={rule.name}>
                  <s-table-cell>
                    <s-text type="strong">{rule.name}</s-text>
                  </s-table-cell>
                  <s-table-cell>{rule.type}</s-table-cell>
                  <s-table-cell>{rule.eta}</s-table-cell>
                  <s-table-cell>
                    <s-badge
                      tone={rule.status === "Active" ? "success" : "warning"}
                    >
                      {rule.status}
                    </s-badge>
                  </s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
              </s-table>
            </div>
          </div>
        )}
      </s-section>

      <s-section heading="Storefront">
        <s-grid
          gridTemplateColumns="@container (inline-size <= 600px) 1fr, 1fr 1fr"
          gap="base"
        >
          <s-box
            padding="base"
            background="subdued"
            border="base"
            borderRadius="base"
          >
            <s-stack direction="block" gap="small-200">
              <s-stack direction="inline" gap="small-200" alignItems="center">
                <s-text type="strong">App embed</s-text>
                <s-badge tone="success">Active</s-badge>
              </s-stack>
              <s-paragraph color="subdued">
                Needed to show estimated delivery on your theme.
              </s-paragraph>
              <s-button icon="external">Activate</s-button>
            </s-stack>
          </s-box>
          <s-box
            padding="base"
            background="subdued"
            border="base"
            borderRadius="base"
          >
            <s-stack direction="block" gap="small-200">
              <s-stack direction="inline" gap="small-200" alignItems="center">
                <s-text type="strong">App blocks</s-text>
                <s-badge>0 active</s-badge>
              </s-stack>
              <s-paragraph color="subdued">
                Place the ETA message on the product page.
              </s-paragraph>
              <s-button icon="external">Manage</s-button>
            </s-stack>
          </s-box>
        </s-grid>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
