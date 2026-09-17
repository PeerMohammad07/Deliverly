import { useState, type CSSProperties } from "react";
import { Link, useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import {
  getRulesForShop,
  toDisplayRule,
} from "../services/deliveryRule.service.server";

const SECTION_HEADING: CSSProperties = {
  margin: "0",
  fontSize: "15px",
  fontWeight: 650,
  lineHeight: "22px",
  color: "#202223",
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = (session as { shop?: string })?.shop;
  if (!shop) {
    throw new Response("Unauthorized: missing shop", { status: 401 });
  }

  try {
    const rules = await getRulesForShop(shop);
    const recent = rules.slice(0, 3).map((rule) => {
      const display = toDisplayRule(rule);
      return {
        id: display.id,
        name: display.name,
        kind: display.displayTypeLabel,
        targets: display.displayTargets,
        eta: display.displayEta,
        enabled: display.enabled,
      };
    });
    return {
      stats: {
        total: rules.length,
        active: rules.filter((r) => r.enabled).length,
        product: rules.filter((r) => r.type === "PRODUCT").length,
        collection: rules.filter((r) => r.type === "COLLECTION").length,
      },
      recent,
    };
  } catch (error) {
    console.error("[app.dashboard] loader failed", { shop, error });
    throw new Response("Failed to load dashboard", { status: 500 });
  }
};

export default function Dashboard() {
  const { stats, recent } = useLoaderData<typeof loader>();
  const [hidden, setHidden] = useState(false);
  const [open, setOpen] = useState(true);
  const [step, setStep] = useState(3);

  const targetedRules = stats.product + stats.collection;
  const activePct =
    stats.total > 0 ? Math.round((stats.active / stats.total) * 100) : 0;

  return (
    <s-page>
      <s-stack direction="block" gap="base">
      <s-stack direction="block" gap="small-200">
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
        <s-paragraph color="subdued">
          Get a quick overview of your delivery estimates and storefront setup.
        </s-paragraph>
      </s-stack>
      {!hidden ? (
        <s-stack direction="block" gap="small-200">
          <s-stack
            direction="inline"
            alignItems="center"
            justifyContent="space-between"
            gap="base"
          >
            <h2 style={SECTION_HEADING}>Setup guide</h2>
            <s-stack direction="inline" gap="small-100" alignItems="center">
              <s-button
                commandFor="setup-menu"
                variant="tertiary"
                tone="neutral"
                icon="menu-horizontal"
                accessibilityLabel="More actions"
              />
              <s-menu
                id="setup-menu"
                accessibilityLabel="Setup guide actions"
              >
                <s-button variant="tertiary" onClick={() => setHidden(true)}>
                  Dismiss
                </s-button>
              </s-menu>
              <s-button
                variant="tertiary"
                tone="neutral"
                icon={open ? "chevron-up" : "chevron-down"}
                accessibilityLabel="Toggle setup guide"
                onClick={() => setOpen(!open)}
              />
            </s-stack>
          </s-stack>
          <s-box
            border="base"
            borderRadius="base"
            background="base"
            padding="base"
          >
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
                            <s-button slot="primary-action" variant="secondary">
                              Yay, Its working 😎
                            </s-button>
                            <s-button
                              slot="secondary-actions"
                              variant="tertiary"
                            >
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
          </s-box>
        </s-stack>
      ) : null}

      <s-stack direction="block" gap="small-200">
        <h2 style={SECTION_HEADING}>Overview</h2>
        <s-grid
          gridTemplateColumns="@container (inline-size <= 600px) 1fr, 1fr 1fr 1fr"
          gap="small-200"
        >
          <s-box background="subdued" borderRadius="base" padding="small">
            <s-stack direction="block" gap="none">
              <div
                style={{
                  fontSize: "26px",
                  fontWeight: 700,
                  lineHeight: "32px",
                  letterSpacing: "-0.02em",
                  color: "#202223",
                }}
              >
                {stats.total}
              </div>
              <s-paragraph color="subdued">Total rules</s-paragraph>
            </s-stack>
          </s-box>
          <s-box background="subdued" borderRadius="base" padding="small">
            <s-stack direction="block" gap="none">
              <div
                style={{
                  fontSize: "26px",
                  fontWeight: 700,
                  lineHeight: "32px",
                  letterSpacing: "-0.02em",
                  color: "#202223",
                }}
              >
                {stats.active}
              </div>
              <s-paragraph color="subdued">Active rules</s-paragraph>
              <div
                style={{
                  fontSize: "12px",
                  lineHeight: "18px",
                  color: "#6d7175",
                }}
              >
                {activePct}% active
              </div>
            </s-stack>
          </s-box>
          <s-box background="subdued" borderRadius="base" padding="small">
            <s-stack direction="block" gap="none">
              <div
                style={{
                  fontSize: "26px",
                  fontWeight: 700,
                  lineHeight: "32px",
                  letterSpacing: "-0.02em",
                  color: "#202223",
                }}
              >
                {targetedRules}
              </div>
              <s-paragraph color="subdued">Targeted rules</s-paragraph>
              <div
                style={{
                  fontSize: "12px",
                  lineHeight: "18px",
                  color: "#6d7175",
                }}
              >
                {stats.product} products · {stats.collection} collections
              </div>
            </s-stack>
          </s-box>
        </s-grid>
      </s-stack>

      <s-stack direction="block" gap="small-200">
        <s-stack
          direction="inline"
          alignItems="center"
          justifyContent="space-between"
          gap="base"
        >
          <h2 style={SECTION_HEADING}>Recent rules</h2>
          <Link
            to="/app/rules"
            style={{
              fontSize: "14px",
              fontWeight: 500,
              color: "#202223",
              textDecoration: "none",
            }}
          >
            View all →
          </Link>
        </s-stack>
        <s-box border="base" borderRadius="small" background="base">
        {recent.length > 0 ? (
          <s-table variant="auto">
            <s-table-header-row>
              <s-table-header listSlot="primary">Rule</s-table-header>
              <s-table-header listSlot="labeled">Applies to</s-table-header>
              <s-table-header listSlot="labeled">Delivery time</s-table-header>
              <s-table-header listSlot="inline">Status</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {recent.map((rule) => (
                <s-table-row key={rule.id}>
                  <s-table-cell>
                    <s-stack direction="block" gap="none">
                      <Link
                        to={`/app/rules/${rule.id}`}
                        style={{
                          fontSize: "14px",
                          fontWeight: 600,
                          color: "#202223",
                          textDecoration: "none",
                        }}
                      >
                        {rule.name}
                      </Link>
                      <s-paragraph color="subdued">{rule.kind}</s-paragraph>
                    </s-stack>
                  </s-table-cell>
                  <s-table-cell>
                    <s-paragraph>{rule.targets}</s-paragraph>
                  </s-table-cell>
                  <s-table-cell>
                    <s-text type="strong">{rule.eta}</s-text>
                  </s-table-cell>
                  <s-table-cell>
                    <s-badge
                      tone={rule.enabled ? "success" : undefined}
                      color="base"
                    >
                      {rule.enabled ? "Active" : "Inactive"}
                    </s-badge>
                  </s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        ) : (
          <s-box padding="large">
            <s-stack direction="block" gap="small-200" alignItems="center">
              <s-paragraph color="subdued">No delivery rules yet.</s-paragraph>
              <s-button variant="primary" href="/app/rules/new">
                Create rule
              </s-button>
            </s-stack>
          </s-box>
        )}
        </s-box>
      </s-stack>

      <s-stack direction="block" gap="small-200">
        <h2 style={SECTION_HEADING}>Storefront</h2>
        <s-box
          padding="base"
          background="base"
          border="base"
          borderRadius="base"
        >
          <s-stack direction="block" gap="small-200">
            <s-stack
              direction="inline"
              gap="small-200"
              alignItems="center"
              justifyContent="space-between"
            >
              <s-text type="strong">Storefront status</s-text>
              <s-badge tone="success" color="base">
                Connected
              </s-badge>
            </s-stack>
            <s-paragraph color="subdued">
              Your delivery estimate is currently enabled on your theme.
            </s-paragraph>
            <s-stack direction="inline" gap="small-200" alignItems="center">
              <s-button variant="secondary">View storefront</s-button>
              <s-button variant="tertiary">Manage theme</s-button>
            </s-stack>
          </s-stack>
        </s-box>
      </s-stack>

      <s-stack direction="block" gap="small-200">
        <h2 style={SECTION_HEADING}>Display options</h2>
        <s-box
          padding="base"
          background="base"
          border="base"
          borderRadius="base"
        >
          <s-stack direction="block" gap="base">
            <s-stack
              direction="inline"
              gap="base"
              alignItems="start"
              justifyContent="space-between"
            >
              <s-stack direction="block" gap="small-100">
                <s-stack direction="inline" gap="small-200" alignItems="center">
                  <s-text type="strong">App embed</s-text>
                  <s-badge tone="success" color="base">
                    Connected
                  </s-badge>
                </s-stack>
                <s-paragraph color="subdued">
                  Shows ETA using the app’s default placement.
                </s-paragraph>
              </s-stack>
              <s-button variant="tertiary">Manage</s-button>
            </s-stack>
            <s-divider direction="inline" />
            <s-stack
              direction="inline"
              gap="base"
              alignItems="start"
              justifyContent="space-between"
            >
              <s-stack direction="block" gap="small-100">
                <s-stack direction="inline" gap="small-200" alignItems="center">
                  <s-text type="strong">Product page app block</s-text>
                  <s-badge color="base">Not connected</s-badge>
                </s-stack>
                <s-paragraph color="subdued">
                  Add the ETA block wherever you want.
                </s-paragraph>
              </s-stack>
              <s-button variant="tertiary">Add to theme</s-button>
            </s-stack>
          </s-stack>
        </s-box>
      </s-stack>
      </s-stack>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
