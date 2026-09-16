import { useState } from "react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { data, Link, useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import {
  getRulesForShop,
  toDisplayRule,
} from "../services/deliveryRule.service.server";
import { handleRuleRowAction } from "../services/rule-row-action.server";
import { useRuleRowActions } from "../hooks/use-rule-row-actions";

// Loader — server-side, enforces shop isolation
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  const shop = (session as { shop?: string })?.shop;

  if (!shop) {
    throw new Response("Unauthorized: missing shop", { status: 401 });
  }

  try {
    const rules = await getRulesForShop(shop);

    // Serialize for client — only the fields the table renders,
    // plus pre-formatted display strings from the service layer.
    const serialized = rules.map((rule) => {
      const display = toDisplayRule(rule);
      return {
        id: display.id,
        name: display.name,
        type: display.type,
        eta: display.displayEta,
        targets: display.displayTargets,
        processingDays: display.processingDays,
        excluded: display.displayExcluded,
        enabled: display.enabled,
      };
    });

    const statusParam = new URL(request.url).searchParams.get("status");
    const status: "all" | "active" | "inactive" =
      statusParam === "active" || statusParam === "inactive"
        ? statusParam
        : "all";
    const counts = {
      all: serialized.length,
      active: serialized.filter((r) => r.enabled).length,
      inactive: serialized.filter((r) => !r.enabled).length,
    };
    const visible =
      status === "all"
        ? serialized
        : serialized.filter((r) => (status === "active") === r.enabled);

    return { rules: visible, shop, status, counts };
  } catch (error) {
    console.error("[app.rules] loader failed", { shop, error });
    throw new Response("Failed to load ETA rules", { status: 500 });
  }
};

/**
 * Row-level intents (toggle/delete/duplicate) — delegated to the shared
 * handler so every rules table behaves identically. Always returns data,
 * never throws to the boundary.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = (session as { shop?: string })?.shop;
  if (!shop) {
    throw new Response("Unauthorized: missing shop", { status: 401 });
  }

  const formData = await request.formData();
  return data(await handleRuleRowAction(shop, formData));
};

type RuleRow = ReturnType<typeof useLoaderData<typeof loader>>["rules"][number];

function EmptyIllustration({ size = 160 }: { size?: number }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        width: `${size + 60}px`,
        height: `${size + 20}px`,
        position: "relative",
      }}
      aria-hidden="true"
    >
      <svg
        width={size}
        height={size}
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
  );
}

function TabEmptyState({
  title,
  hint,
  actionLabel,
  actionHref,
  onAction,
}: {
  title: string;
  hint: string;
  actionLabel?: string;
  actionHref?: string;
  onAction?: () => void;
}) {
  return (
    <s-box border="base" borderRadius="base" background="base" padding="large">
      <s-stack direction="block" gap="base" alignItems="center">
        <EmptyIllustration size={120} />
        <s-stack direction="block" gap="small-200" alignItems="center">
          <div
            style={{
              fontSize: "15px",
              fontWeight: 650,
              lineHeight: "22px",
              color: "#202223",
              textAlign: "center",
            }}
          >
            {title}
          </div>
          <div style={{ textAlign: "center", maxWidth: "420px" }}>
            <s-paragraph color="subdued">{hint}</s-paragraph>
          </div>
        </s-stack>
        {actionHref ? (
          <s-button variant="secondary" href={actionHref}>
            {actionLabel}
          </s-button>
        ) : actionLabel ? (
          <s-button type="button" variant="tertiary" onClick={onAction}>
            {actionLabel}
          </s-button>
        ) : null}
      </s-stack>
    </s-box>
  );
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
        <s-box padding="base">
          <EmptyIllustration size={140} />
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
            No delivery rules yet
          </div>
          <div style={{ textAlign: "center", maxWidth: "480px" }}>
            <s-paragraph color="subdued">
              Create a rule to start showing estimated delivery dates on your
              storefront.
            </s-paragraph>
          </div>
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
  busyId,
  onToggle,
  onDelete,
  onDuplicate,
  onQueryChange,
}: {
  rules: RuleRow[];
  busyId: string;
  onToggle: (rule: Pick<RuleRow, "id" | "enabled">) => void;
  onDelete: (rule: Pick<RuleRow, "id" | "name">) => void;
  onDuplicate: (rule: Pick<RuleRow, "id">) => void;
  onQueryChange: (value: string) => void;
}) {
  return (
    <s-box border="base" borderRadius="small" background="base">
      <s-table variant="auto">
        <s-search-field
          slot="filters"
          label="Search rules"
          labelAccessibilityVisibility="exclusive"
          placeholder="Search rules"
          name="rule-search"
          autocomplete="off"
          onInput={(e: unknown) => {
            const target = (e as { target?: { value?: unknown } })?.target;
            onQueryChange(
              target && typeof target.value === "string" ? target.value : "",
            );
          }}
        />
            <s-table-header-row>
              <s-table-header listSlot="primary">Rule</s-table-header>
              <s-table-header listSlot="labeled">Applies to</s-table-header>
              <s-table-header listSlot="labeled">Delivery time</s-table-header>
              <s-table-header listSlot="labeled">Processing time</s-table-header>
              <s-table-header listSlot="labeled">Excluded</s-table-header>
              <s-table-header listSlot="labeled">Status</s-table-header>
              <s-table-header listSlot="inline">Actions</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {rules.map((rule) => {
                const busy = busyId === rule.id;
                return (
                  <s-table-row key={rule.id}>
                    <s-table-cell>
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
                      <s-paragraph color="subdued">{rule.excluded}</s-paragraph>
                    </s-table-cell>
                    <s-table-cell>
                      <s-badge
                        tone={rule.enabled ? "success" : undefined}
                        color="base"
                      >
                        {rule.enabled ? "Active" : "Inactive"}
                      </s-badge>
                    </s-table-cell>
                    <s-table-cell>
                      <s-button
                        type="button"
                        variant="tertiary"
                        icon="menu-vertical"
                        accessibilityLabel={`Actions for ${rule.name}`}
                        disabled={busy}
                        commandFor={`rule-actions-${rule.id}`}
                        command="--show"
                      />
                      <s-menu
                        id={`rule-actions-${rule.id}`}
                        accessibilityLabel={`Actions for ${rule.name}`}
                      >
                        <s-button href={`/app/rules/${rule.id}`}>
                          Edit rule
                        </s-button>
                        <s-button
                          type="button"
                          commandFor={`rule-actions-${rule.id}`}
                          command="--hide"
                          onClick={() => onDuplicate(rule)}
                        >
                          Duplicate rule
                        </s-button>
                        <s-button
                          type="button"
                          commandFor={`rule-actions-${rule.id}`}
                          command="--hide"
                          onClick={() => onToggle(rule)}
                        >
                          {rule.enabled ? "Deactivate" : "Activate"}
                        </s-button>
                        <s-button
                          type="button"
                          tone="critical"
                          commandFor={`rule-actions-${rule.id}`}
                          command="--hide"
                          onClick={() => onDelete(rule)}
                        >
                          Delete
                        </s-button>
                      </s-menu>
                    </s-table-cell>
                  </s-table-row>
                );
              })}
            </s-table-body>
          </s-table>
      </s-box>
  );
}

export default function EtaRulesPage() {
  const { rules, counts, status } = useLoaderData<typeof loader>();
  const { busyId, submitIntent, shopify } = useRuleRowActions();
  const [pendingDelete, setPendingDelete] = useState<Pick<
    RuleRow,
    "id" | "name"
  > | null>(null);
  const [query, setQuery] = useState("");
  const hasRules = counts.all > 0;
  const visible = rules.filter((rule) =>
    rule.name.toLowerCase().includes(query.trim().toLowerCase()),
  );

  function toggleRule(rule: Pick<RuleRow, "id" | "enabled">) {
    submitIntent("toggle", { id: rule.id, enabled: String(!rule.enabled) });
  }

  function confirmDelete() {
    if (!pendingDelete) return;
    const id = pendingDelete.id;
    setPendingDelete(null);
    submitIntent("delete", { id });
  }

  function openDeleteModal(rule: Pick<RuleRow, "id" | "name">) {
    setPendingDelete(rule);
    shopify.modal.show("delete-rule-modal").catch(() => undefined);
  }

  function duplicateRule(rule: Pick<RuleRow, "id">) {
    submitIntent("duplicate", { id: rule.id });
  }

  return (
    <s-page>
      <s-stack direction="block" gap="base">
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
            Manage the delivery estimates shown to your customers.
          </s-paragraph>
        </s-stack>

        {hasRules ? (
          <s-stack direction="block" gap="base">
            <div style={{ borderBottom: "1px solid #e7e5e4" }}>
              <s-stack direction="inline" gap="base" alignItems="center">
                {(["all", "active", "inactive"] as const).map((tab) => {
                  const active = status === tab;
                  return (
                    <Link
                      key={tab}
                      prefetch="intent"
                      to={
                        tab === "all" ? "/app/rules" : `/app/rules?status=${tab}`
                      }
                      style={{
                        padding: "8px 4px",
                        marginBottom: "-1px",
                        textDecoration: "none",
                        fontSize: "14px",
                        fontWeight: active ? 600 : 500,
                        color: active ? "#202223" : "#6d7175",
                        borderBottom: active
                          ? "2px solid #1a1a1a"
                          : "2px solid transparent",
                      }}
                    >
                      {tab === "all"
                        ? `All ${counts.all}`
                        : tab === "active"
                          ? `Active ${counts.active}`
                          : `Inactive ${counts.inactive}`}
                    </Link>
                  );
                })}
              </s-stack>
            </div>
            {visible.length > 0 ? (
              <RulesTable
                rules={visible}
                busyId={busyId}
                onToggle={toggleRule}
                onDelete={openDeleteModal}
                onDuplicate={duplicateRule}
                onQueryChange={setQuery}
              />
            ) : query.trim() ? (
              <TabEmptyState
                title="No rules found"
                hint="Try another search or clear your search."
                actionLabel="Clear search"
                onAction={() => setQuery("")}
              />
            ) : (
              <TabEmptyState
                title={
                  status === "active"
                    ? "No active rules"
                    : "No inactive rules"
                }
                hint={
                  status === "active"
                    ? "Rules you activate will appear here."
                    : "Rules you deactivate will appear here."
                }
                actionLabel="View all rules"
                actionHref="/app/rules"
              />
            )}
            <s-box>
              <div style={{ textAlign: "center" }}>
                <s-stack
                  direction="inline"
                  gap="small-200"
                  alignItems="center"
                  justifyContent="center"
                >
                  <s-icon
                    type="info"
                    size="small"
                    interestFor="rules-priority-tip"
                  />
                  <s-paragraph color="subdued">How rules work</s-paragraph>
                </s-stack>
                <s-tooltip id="rules-priority-tip">
                  If multiple rules could apply, the most specific rule is used
                  first: Product rules → Collection rules → All products.
                </s-tooltip>
              </div>
            </s-box>
          </s-stack>
        ) : (
          <EmptyState />
        )}
      </s-stack>

      <s-modal
        id="delete-rule-modal"
        heading={
          pendingDelete ? `Delete “${pendingDelete.name}”?` : "Delete rule?"
        }
      >
        <s-paragraph>
          This removes the rule and its delivery estimates from your store.
          This can’t be undone.
        </s-paragraph>
        <s-button
          slot="primary-action"
          variant="primary"
          tone="critical"
          commandFor="delete-rule-modal"
          command="--hide"
          onClick={confirmDelete}
        >
          Delete
        </s-button>
        <s-button
          slot="secondary-actions"
          commandFor="delete-rule-modal"
          command="--hide"
        >
          Cancel
        </s-button>
      </s-modal>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
