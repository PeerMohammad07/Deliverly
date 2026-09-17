import { useEffect, useRef, useState } from "react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import {
  data,
  useLoaderData,
  useNavigate,
  useNavigation,
} from "react-router";
import { authenticate } from "../shopify.server";
import {
  getRulePageForShop,
  toDisplayRule,
} from "../services/deliveryRule.service.server";
import { handleRuleRowAction } from "../services/rule-row-action.server";
import { useRuleRowActions } from "../hooks/use-rule-row-actions";

const PAGE_SIZE = 10;

// Loader — server-side, enforces shop isolation
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  const shop = (session as { shop?: string })?.shop;

  if (!shop) {
    throw new Response("Unauthorized: missing shop", { status: 401 });
  }

  try {
    const url = new URL(request.url);
    const statusParam = url.searchParams.get("status");
    const status: "all" | "active" | "inactive" =
      statusParam === "active" || statusParam === "inactive"
        ? statusParam
        : "all";
    const query = (url.searchParams.get("q") ?? "").trim().slice(0, 100);
    const noticeParam = url.searchParams.get("notice");
    const notice =
      noticeParam === "created" || noticeParam === "updated"
        ? noticeParam
        : null;
    const requestedPage = Number(url.searchParams.get("page") ?? "1");
    const page =
      Number.isInteger(requestedPage) &&
      requestedPage >= 1 &&
      requestedPage <= 10_000
        ? requestedPage
        : 1;
    let result = await getRulePageForShop(shop, {
      status,
      query,
      page,
      pageSize: PAGE_SIZE,
    });
    const totalPages = Math.max(1, Math.ceil(result.filteredTotal / PAGE_SIZE));
    const currentPage = Math.min(page, totalPages);
    if (currentPage !== page) {
      result = await getRulePageForShop(shop, {
        status,
        query,
        page: currentPage,
        pageSize: PAGE_SIZE,
      });
    }

    // Serialize for client — only the fields the table renders,
    // plus pre-formatted display strings from the service layer.
    const serialized = result.rules.map((rule) => {
      const display = toDisplayRule(rule);
      return {
        id: display.id,
        name: display.name,
        eta: display.displayEta,
        targets: display.displayTargets,
        processingDays: display.processingDays,
        excluded: display.displayExcluded,
        enabled: display.enabled,
      };
    });

    const counts = {
      all: result.total,
      active: result.active,
      inactive: result.inactive,
    };
    return {
      rules: serialized,
      shop,
      status,
      counts,
      query,
      notice,
      page: currentPage,
      hasPreviousPage: currentPage > 1,
      hasNextPage: currentPage < totalPages,
    };
  } catch (error) {
    console.error("[app.rules] loader failed", { shop, error });
    throw new Response("Failed to load ETA rules", { status: 500 });
  }
};

/**
 * Row-level intents (toggle/delete) — delegated to the shared
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

function buildRulesUrl(
  status: "all" | "active" | "inactive",
  query: string,
  page = 1,
): string {
  const params = new URLSearchParams();
  if (status !== "all") params.set("status", status);
  if (query.trim()) params.set("q", query.trim());
  if (page > 1) params.set("page", String(page));
  const search = params.toString();
  return search ? `/app/rules?${search}` : "/app/rules";
}

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
        <rect x="52" y="52" width="28" height="28" rx="2" fill="#E8B84B" />
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

function EmptyState() {
  return (
    <s-box border="base" borderRadius="base" background="base" padding="large">
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
  query,
  status,
  counts,
  loading,
  hasPreviousPage,
  hasNextPage,
  onToggle,
  onDelete,
  onQueryChange,
  onStatusChange,
  onPreviousPage,
  onNextPage,
}: {
  rules: RuleRow[];
  busyId: string;
  query: string;
  status: "all" | "active" | "inactive";
  counts: { all: number; active: number; inactive: number };
  loading: boolean;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
  onToggle: (rule: Pick<RuleRow, "id">) => void;
  onDelete: (rule: Pick<RuleRow, "id" | "name">) => void;
  onQueryChange: (value: string) => void;
  onStatusChange: (value: "all" | "active" | "inactive") => void;
  onPreviousPage: () => void;
  onNextPage: () => void;
}) {
  return (
    <s-box
      border="base"
      borderRadius="base"
      background="base"
      overflow="hidden"
    >
      <s-box padding="base">
        <s-stack
          direction="inline"
          gap="base"
          alignItems="center"
          justifyContent="space-between"
        >
          <s-heading>Rules</s-heading>
          <s-button
            variant="primary"
            icon="plus"
            href="/app/rules/new"
          >
            Create rule
          </s-button>
        </s-stack>
      </s-box>
      <s-divider direction="inline" />
      <s-box padding="base">
        <s-grid
          gridTemplateColumns="minmax(0, 1fr) 200px"
          gap="small-200"
          alignItems="center"
        >
          <s-search-field
            label="Search rules"
            labelAccessibilityVisibility="exclusive"
            placeholder="Search by rule name"
            name="rule-search"
            autocomplete="off"
            value={query}
            onInput={(event: unknown) => {
              const target = (event as { target?: { value?: unknown } })
                ?.target;
              onQueryChange(
                target && typeof target.value === "string" ? target.value : "",
              );
            }}
          />
          <s-select
            label="Filter rules by status"
            labelAccessibilityVisibility="exclusive"
            name="rule-status"
            value={status}
            onChange={(event: unknown) => {
              const target = (event as { target?: { value?: unknown } })
                ?.target;
              const value = target?.value;
              if (
                value === "all" ||
                value === "active" ||
                value === "inactive"
              ) {
                onStatusChange(value);
              }
            }}
          >
            <s-option value="all">All rules ({counts.all})</s-option>
            <s-option value="active">Active ({counts.active})</s-option>
            <s-option value="inactive">Inactive ({counts.inactive})</s-option>
          </s-select>
        </s-grid>
      </s-box>
      <s-divider direction="inline" />
      {rules.length > 0 ? (
        <s-table
          variant="auto"
          loading={loading}
          paginate={hasPreviousPage || hasNextPage}
          hasPreviousPage={hasPreviousPage}
          hasNextPage={hasNextPage}
          onPreviousPage={onPreviousPage}
          onNextPage={onNextPage}
        >
          <s-table-header-row>
            <s-table-header listSlot="primary">Rule</s-table-header>
            <s-table-header listSlot="labeled">Applies to</s-table-header>
            <s-table-header listSlot="labeled">
              Delivery estimate
            </s-table-header>
            <s-table-header listSlot="labeled">Excluded days</s-table-header>
            <s-table-header listSlot="labeled">Status</s-table-header>
            <s-table-header listSlot="inline">Actions</s-table-header>
          </s-table-header-row>
          <s-table-body>
            {rules.map((rule) => {
              const busy = busyId === rule.id;
              const processing =
                rule.processingDays === 0
                  ? "No processing delay"
                  : `${rule.processingDays} processing day${rule.processingDays === 1 ? "" : "s"}`;
              return (
                <s-table-row key={rule.id}>
                  <s-table-cell>
                    <s-text type="strong">{rule.name}</s-text>
                  </s-table-cell>
                  <s-table-cell>
                    <s-paragraph>{rule.targets}</s-paragraph>
                  </s-table-cell>
                  <s-table-cell>
                    <s-stack direction="block" gap="none">
                      <s-text type="strong">{rule.eta}</s-text>
                      <s-text color="subdued">{processing}</s-text>
                    </s-stack>
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
                      loading={busy}
                      disabled={Boolean(busyId) && !busy}
                      commandFor={`rule-actions-${rule.id}`}
                      command="--show"
                    />
                    <s-menu
                      id={`rule-actions-${rule.id}`}
                      accessibilityLabel={`Actions for ${rule.name}`}
                    >
                      <s-button icon="edit" href={`/app/rules/${rule.id}`}>
                        Edit rule
                      </s-button>
                      <s-button
                        type="button"
                        icon={rule.enabled ? "x" : "check"}
                        commandFor={`rule-actions-${rule.id}`}
                        command="--hide"
                        onClick={() => onToggle(rule)}
                      >
                        {rule.enabled ? "Deactivate" : "Activate"}
                      </s-button>
                      <s-button
                        type="button"
                        tone="critical"
                        icon="delete"
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
      ) : (
        <s-box padding="large">
          <s-stack direction="block" gap="small-200" alignItems="center">
            <s-text type="strong">
              {query.trim() ? "No matching rules" : `No ${status} rules`}
            </s-text>
            <s-paragraph color="subdued">
              {query.trim()
                ? "Try another search or clear your search."
                : "Change the status filter to view other rules."}
            </s-paragraph>
            <s-button
              type="button"
              variant="tertiary"
              onClick={() =>
                query.trim() ? onQueryChange("") : onStatusChange("all")
              }
            >
              {query.trim() ? "Clear search" : "View all rules"}
            </s-button>
          </s-stack>
        </s-box>
      )}
    </s-box>
  );
}

export default function EtaRulesPage() {
  const {
    rules,
    counts,
    status,
    query: loadedQuery,
    notice,
    page,
    hasPreviousPage,
    hasNextPage,
  } = useLoaderData<typeof loader>();
  const { busyId, submitIntent, shopify } = useRuleRowActions();
  const navigate = useNavigate();
  const navigation = useNavigation();
  const [pendingDelete, setPendingDelete] = useState<Pick<
    RuleRow,
    "id" | "name"
  > | null>(null);
  const [query, setQuery] = useState(loadedQuery);
  const shownNotice = useRef<string | null>(null);
  const hasRules = counts.all > 0;
  const loading = navigation.state !== "idle" || notice !== null;

  useEffect(() => {
    shopify.saveBar.hide("rule-form-save-bar").catch((error) => {
      console.warn("[app.rules] stale save bar cleanup failed", error);
    });
    if (!notice || shownNotice.current === notice) return;
    shownNotice.current = notice;
    shopify.toast.show(
      notice === "created" ? "Delivery rule created." : "Delivery rule updated.",
    );
    void navigate(buildRulesUrl(status, loadedQuery, page), { replace: true });
  }, [loadedQuery, navigate, notice, page, shopify, status]);

  useEffect(() => {
    setQuery(loadedQuery);
  }, [loadedQuery]);

  useEffect(() => {
    if (query.trim() === loadedQuery) return;
    const timeout = window.setTimeout(() => {
      void navigate(buildRulesUrl(status, query), { replace: true });
    }, 300);
    return () => window.clearTimeout(timeout);
  }, [loadedQuery, navigate, query, status]);

  function toggleRule(rule: Pick<RuleRow, "id">) {
    submitIntent("toggle", { id: rule.id });
  }

  function confirmDelete() {
    if (!pendingDelete) return;
    const id = pendingDelete.id;
    setPendingDelete(null);
    submitIntent("delete", { id });
  }

  function openDeleteModal(rule: Pick<RuleRow, "id" | "name">) {
    setPendingDelete(rule);
    shopify.modal.show("delete-rule-modal").catch((error) => {
      console.error("[app.rules] delete modal failed", error);
      shopify.toast.show("Couldn’t open the delete confirmation.", {
        isError: true,
      });
    });
  }

  function changeStatus(nextStatus: "all" | "active" | "inactive") {
    void navigate(buildRulesUrl(nextStatus, query));
  }

  return (
    <s-page heading="ETA rules">
      <s-stack direction="block" gap="base">
        <s-paragraph color="subdued">
          Manage the delivery estimates shown to your customers.
        </s-paragraph>

        {hasRules ? (
          <s-stack direction="block" gap="base">
            <RulesTable
              rules={rules}
              busyId={busyId}
              query={query}
              status={status}
              counts={counts}
              loading={loading}
              hasPreviousPage={hasPreviousPage}
              hasNextPage={hasNextPage}
              onToggle={toggleRule}
              onDelete={openDeleteModal}
              onQueryChange={setQuery}
              onStatusChange={changeStatus}
              onPreviousPage={() =>
                void navigate(buildRulesUrl(status, query, page - 1))
              }
              onNextPage={() =>
                void navigate(buildRulesUrl(status, query, page + 1))
              }
            />
            <s-stack
              direction="inline"
              gap="small-100"
              alignItems="center"
              justifyContent="center"
            >
              <s-icon type="info" size="small" />
              <s-paragraph color="subdued">
                Priority: Product rules → Collection rules → All products
              </s-paragraph>
            </s-stack>
          </s-stack>
        ) : (
          <EmptyState />
        )}
      </s-stack>

      <s-modal
        id="delete-rule-modal"
        heading={
          pendingDelete ? `Delete ${pendingDelete.name}?` : "Delete rule?"
        }
      >
        <s-paragraph>
          This removes the rule and its delivery estimates from your store. This
          can’t be undone.
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
