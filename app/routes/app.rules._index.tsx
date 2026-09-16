import { boundary } from "@shopify/shopify-app-react-router/server";
import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData, Link } from "react-router";
import { authenticate } from "../shopify.server";
import {
  getRulesForShop,
  toDisplayRule,
} from "../services/deliveryRule.service.server";

// Loader — server-side, enforces shop isolation
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  const shop = (session as { shop?: string })?.shop;

  if (!shop) {
    throw new Response("Unauthorized: missing shop", { status: 401 });
  }

  try {
    const rules = await getRulesForShop(shop);

    // Serialize for client — dates as ISO, pre-formatted display fields
    const serialized = rules.map((rule) => {
      const display = toDisplayRule(rule);
      return {
        id: display.id,
        name: display.name,
        type: display.type,
        typeLabel: display.displayTypeLabel,
        eta: display.displayEta,
        targets: display.displayTargets,
        processingDays: display.processingDays,
        minDays: display.minDeliveryDays,
        maxDays: display.maxDeliveryDays,
        enabled: display.enabled,
        updatedAt: display.updatedAt.toISOString(),
        createdAt: display.createdAt.toISOString(),
        targetsCount: display.targets.length,
      };
    });

    return { rules: serialized, shop };
  } catch (error) {
    console.error("[app.rules] loader failed", { shop, error });
    throw new Response("Failed to load ETA rules", { status: 500 });
  }
};

function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(new Date(iso));
  } catch {
    return iso.slice(0, 10);
  }
}

function EmptyState() {
  return (
    <s-box
      border="base"
      borderRadius="base"
      background="base"
      padding="large"
    >
      <s-stack direction="block" gap="base" alignItems="center">
        {/* Illustration — stacked documents with amber header */}
        <s-box padding="large">
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              width: "220px",
              height: "180px",
              position: "relative",
            }}
            aria-hidden="true"
          >
            <svg
              width="160"
              height="160"
              viewBox="0 0 160 160"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              style={{ filter: "drop-shadow(0 8px 16px rgba(0,0,0,0.06))" }}
            >
              <circle cx="80" cy="80" r="70" fill="#F3F3F5" />
              <rect
                x="58"
                y="24"
                width="72"
                height="92"
                rx="6"
                fill="white"
                stroke="#E3E3E7"
                strokeWidth="1.2"
                opacity="0.7"
              />
              <rect
                x="52"
                y="28"
                width="72"
                height="92"
                rx="6"
                fill="white"
                stroke="#E3E3E7"
                strokeWidth="1.2"
                opacity="0.85"
              />
              <rect
                x="36"
                y="32"
                width="84"
                height="98"
                rx="8"
                fill="white"
                stroke="#EDEEEF"
                strokeWidth="1.4"
              />
              <rect
                x="52"
                y="52"
                width="28"
                height="28"
                rx="2"
                fill="#E8B84B"
              />
              <rect
                x="52"
                y="52"
                width="28"
                height="28"
                rx="2"
                fill="none"
                stroke="#D9A441"
                strokeWidth="0.8"
              />
              <path d="M52 52 L80 80 L52 80 Z" fill="black" opacity="0.06" />
              <rect x="52" y="92" width="52" height="5" rx="2.5" fill="#EDEEEF" />
              <rect x="52" y="102" width="52" height="5" rx="2.5" fill="#EDEEEF" />
              <rect x="52" y="112" width="52" height="5" rx="2.5" fill="#EDEEEF" />
              <rect x="52" y="124" width="32" height="5" rx="2.5" fill="#EDEEEF" />
            </svg>
          </div>
        </s-box>

        <s-stack direction="block" gap="small-200" alignItems="center">
          <div
            style={{
              fontSize: "16px",
              fontWeight: 650,
              lineHeight: "24px",
              color: "#202223",
              textAlign: "center",
            }}
          >
            No ETA rules created
          </div>
          <div style={{ textAlign: "center", maxWidth: "480px" }}>
            <s-paragraph color="subdued">
              Create ETA rules for specific products, tags, vendor, collections,
              inventory, location, shipping, zipcode and more
            </s-paragraph>
          </div>
          <s-link href="https://help.shopify.com/manual" target="_blank">
            Learn how to set up ETA rules
          </s-link>
        </s-stack>

        <s-button variant="primary" href="/app/rules/new">
          Create rule
        </s-button>
      </s-stack>
    </s-box>
  );
}

function RulesTable({
  rules,
}: {
  rules: ReturnType<typeof useLoaderData<typeof loader>>["rules"];
}) {
  return (
    <div style={{ overflowX: "auto", maxWidth: "100%" }}>
      <s-box border="base" borderRadius="base" background="base">
        <div style={{ minWidth: "640px" }}>
          <s-table variant="auto">
        <s-table-header-row>
          <s-table-header listSlot="primary">Rule</s-table-header>
          <s-table-header listSlot="labeled">Type</s-table-header>
          <s-table-header listSlot="labeled">Applies to</s-table-header>
          <s-table-header listSlot="labeled">ETA</s-table-header>
          <s-table-header listSlot="labeled">Processing</s-table-header>
          <s-table-header listSlot="labeled">Updated</s-table-header>
          <s-table-header listSlot="inline">Status</s-table-header>
        </s-table-header-row>
        <s-table-body>
          {rules.map((rule) => (
            <s-table-row key={rule.id}>
              <s-table-cell>
                <Link
                  to={`/app/rules/${rule.id}`}
                  style={{
                    textDecoration: "none",
                    color: "inherit",
                  }}
                >
                  <s-stack direction="inline" gap="small-200" alignItems="center">
                    <s-text type="strong">{rule.name}</s-text>
                  </s-stack>
                </Link>
              </s-table-cell>
              <s-table-cell>
                <s-badge
                  tone={
                    rule.type === "DEFAULT"
                      ? "info"
                      : rule.type === "PRODUCT"
                        ? "success"
                        : "caution"
                  }
                >
                  {rule.typeLabel}
                </s-badge>
              </s-table-cell>
              <s-table-cell>
                <s-paragraph>{rule.targets}</s-paragraph>
              </s-table-cell>
              <s-table-cell>
                <s-text type="strong">{rule.eta}</s-text>
              </s-table-cell>
              <s-table-cell>
                <s-paragraph>
                  {rule.processingDays === 0
                    ? "No delay"
                    : `${rule.processingDays} day${rule.processingDays === 1 ? "" : "s"}`}
                </s-paragraph>
              </s-table-cell>
              <s-table-cell>
                <s-paragraph color="subdued">
                  {formatDate(rule.updatedAt)}
                </s-paragraph>
              </s-table-cell>
              <s-table-cell>
                <s-badge tone={rule.enabled ? "success" : "critical"}>
                  {rule.enabled ? "Active" : "Disabled"}
                </s-badge>
              </s-table-cell>
            </s-table-row>
          ))}
        </s-table-body>
          </s-table>
        </div>
      </s-box>
    </div>
  );
}

export default function EtaRulesPage() {
  const { rules } = useLoaderData<typeof loader>();
  const hasRules = rules.length > 0;

  return (
    <s-page>
      <s-stack direction="block" gap="base">
        {/* Heading outside card — matches reference image, not inside s-section/s-card */}
        <s-stack direction="block" gap="small-200">
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
              ETA rules
            </h1>
            {hasRules ? (
              <s-button variant="primary" icon="plus" href="/app/rules/new">
                Create rule
              </s-button>
            ) : null}
          </s-stack>
          <s-paragraph color="subdued">
            Manage which delivery estimate shoppers see.
          </s-paragraph>
        </s-stack>

        {hasRules ? (
          <s-stack direction="block" gap="base">
            <RulesTable rules={rules} />
            <s-box>
              <div style={{ textAlign: "center" }}>
                <s-paragraph color="subdued">
                  Rules are applied by priority: Product → Collection → Default.
                  First match wins.
                </s-paragraph>
              </div>
            </s-box>
          </s-stack>
        ) : (
          <EmptyState />
        )}
      </s-stack>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
