import { useEffect, useRef, useState } from "react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { data, useLoaderData, useNavigate, useNavigation } from "react-router";
import { authenticate } from "../shopify.server";
import {
  getRulePageForShop,
  toDisplayRule,
} from "../services/deliveryRule.service.server";
import { handleRuleRowAction } from "../services/rule-row-action.server";
import { useRuleRowActions } from "../hooks/use-rule-row-actions";
import { parseExcludedDays } from "../utils/delivery-dates";
import { RulesEmptyState } from "../components/rules/rules-empty-state";
import { RulePriorityBar } from "../components/rules/rule-priority-bar";
import { WorkingDays } from "../components/rules/working-days";
import styles from "../components/rules/rules.module.css";

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
        kind: display.displayTypeLabel,
        isDefault: display.type === "DEFAULT",
        excludedDays: [...parseExcludedDays(display.excludedDays)],
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

type RuleStatus = "all" | "active" | "inactive";

type RuleRow = ReturnType<typeof useLoaderData<typeof loader>>["rules"][number];

function buildRulesUrl(status: RuleStatus, query: string, page = 1): string {
  const params = new URLSearchParams();
  if (status !== "all") params.set("status", status);
  if (query.trim()) params.set("q", query.trim());
  if (page > 1) params.set("page", String(page));
  const search = params.toString();
  return search ? `/app/rules?${search}` : "/app/rules";
}

const STATUS_TABS: { value: RuleStatus; label: string }[] = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
];

function processingLabel(days: number) {
  if (days === 0) return "No processing delay";
  return `+${days} processing day${days === 1 ? "" : "s"}`;
}

/**
 * Lives in the table body: Polaris shows it only when the body has no
 * rows and the table isn't loading, spanning every column.
 */
function NoResults({
  query,
  status,
  onClearSearch,
  onViewAll,
}: {
  query: string;
  status: RuleStatus;
  onClearSearch: () => void;
  onViewAll: () => void;
}) {
  const scope = status === "all" ? "rules" : `${status} rules`;
  const searching = query.trim() !== "";
  return (
    <s-empty-state
      heading={
        searching ? `No ${scope} match “${query.trim()}”` : `No ${scope}`
      }
    >
      <s-icon slot="graphic" type="search" />
      <s-text slot="subheading">
        {searching
          ? "Try another search, or check all rules."
          : "Change the filter to see your other rules."}
      </s-text>
      {searching ? (
        <s-button
          slot="primary-action"
          variant="primary"
          type="button"
          onClick={onClearSearch}
        >
          Clear search
        </s-button>
      ) : null}
      {status !== "all" ? (
        <s-button
          slot="secondary-actions"
          variant="secondary"
          type="button"
          onClick={onViewAll}
        >
          View all rules
        </s-button>
      ) : null}
    </s-empty-state>
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
  onViewAll,
  onPreviousPage,
  onNextPage,
}: {
  rules: RuleRow[];
  busyId: string;
  query: string;
  status: RuleStatus;
  counts: Record<RuleStatus, number>;
  loading: boolean;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
  onToggle: (rule: Pick<RuleRow, "id">) => void;
  onDelete: (rule: Pick<RuleRow, "id" | "name">) => void;
  onQueryChange: (value: string) => void;
  onStatusChange: (value: RuleStatus) => void;
  onViewAll: () => void;
  onPreviousPage: () => void;
  onNextPage: () => void;
}) {
  return (
    <s-section padding="none" accessibilityLabel="Rules">
      <div className={styles.toolbar}>
        <div
          className={styles.pills}
          role="group"
          aria-label="Filter by status"
        >
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              className={`${styles.pill} ${status === tab.value ? styles.pillSelected : ""}`}
              aria-pressed={status === tab.value}
              aria-label={`${tab.label} (${counts[tab.value]})`}
              onClick={() => onStatusChange(tab.value)}
            >
              {tab.label}
              <span className={styles.pillCount}>{counts[tab.value]}</span>
            </button>
          ))}
        </div>
        <div className={styles.search}>
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
        </div>
      </div>
      <s-divider />
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
          <s-table-header listSlot="labeled">Delivery estimate</s-table-header>
          <s-table-header listSlot="labeled">Working days</s-table-header>
          <s-table-header listSlot="inline">Status</s-table-header>
          <s-table-header listSlot="inline">
            <s-text accessibilityVisibility="exclusive">Actions</s-text>
          </s-table-header>
        </s-table-header-row>
        <s-table-body>
          {rules.map((rule) => {
            const busy = busyId === rule.id;
            const menuId = `rule-actions-${rule.id}`;
            return (
              <s-table-row key={rule.id}>
                <s-table-cell>
                  <s-stack
                    direction="inline"
                    gap="small-200"
                    alignItems="center"
                  >
                    <s-text>
                      <span className={styles.strong}>{rule.name}</span>
                    </s-text>
                    <s-badge tone={rule.isDefault ? "info" : undefined}>
                      {rule.kind}
                    </s-badge>
                  </s-stack>
                </s-table-cell>
                <s-table-cell>
                  <s-text>{rule.targets}</s-text>
                </s-table-cell>
                <s-table-cell>
                  <s-stack direction="block" gap="none">
                    <s-text>
                      <span className={styles.strong}>{rule.eta}</span>
                    </s-text>
                    <s-text color="subdued">
                      {processingLabel(rule.processingDays)}
                    </s-text>
                  </s-stack>
                </s-table-cell>
                <s-table-cell>
                  <WorkingDays excludedDays={rule.excludedDays} />
                </s-table-cell>
                <s-table-cell>
                  <s-badge
                    icon="bullet"
                    tone={rule.enabled ? "success" : undefined}
                  >
                    {rule.enabled ? "Active" : "Inactive"}
                  </s-badge>
                </s-table-cell>
                <s-table-cell>
                  <s-button
                    type="button"
                    variant="tertiary"
                    icon="menu-horizontal"
                    accessibilityLabel={`Actions for ${rule.name}`}
                    loading={busy}
                    disabled={Boolean(busyId) && !busy}
                    commandFor={menuId}
                    command="--show"
                  />
                  <s-menu
                    id={menuId}
                    accessibilityLabel={`Actions for ${rule.name}`}
                  >
                    <s-section>
                      <s-button icon="edit" href={`/app/rules/${rule.id}`}>
                        Edit rule
                      </s-button>
                      <s-button
                        type="button"
                        icon={rule.enabled ? "minus-circle" : "check-circle"}
                        commandFor={menuId}
                        command="--hide"
                        onClick={() => onToggle(rule)}
                      >
                        {rule.enabled ? "Deactivate" : "Activate"}
                      </s-button>
                    </s-section>
                    <s-section>
                      <s-button
                        type="button"
                        tone="critical"
                        icon="delete"
                        commandFor={menuId}
                        command="--hide"
                        onClick={() => onDelete(rule)}
                      >
                        Delete
                      </s-button>
                    </s-section>
                  </s-menu>
                </s-table-cell>
              </s-table-row>
            );
          })}
          <NoResults
            query={query}
            status={status}
            onClearSearch={() => onQueryChange("")}
            onViewAll={onViewAll}
          />
        </s-table-body>
      </s-table>
    </s-section>
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
  const { busyId, submitIntent, shopify, error, clearError, showError } =
    useRuleRowActions();
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
      notice === "created"
        ? "Delivery rule created."
        : "Delivery rule updated.",
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
      showError("Couldn’t open the delete confirmation. Try again.");
    });
  }

  function changeStatus(nextStatus: RuleStatus) {
    void navigate(buildRulesUrl(nextStatus, query));
  }

  return (
    <s-page heading="ETA rules">
      {hasRules ? (
        <s-button
          slot="primary-action"
          variant="primary"
          icon="plus"
          href="/app/rules/new"
        >
          Create rule
        </s-button>
      ) : null}
      <s-stack direction="block" gap="base">
        <s-paragraph color="subdued">
          Manage the delivery estimates shown to your customers.
        </s-paragraph>

        {error ? (
          <s-banner
            tone="critical"
            heading="Couldn’t update rule"
            dismissible
            onDismiss={clearError}
          >
            {error}
          </s-banner>
        ) : null}

        {hasRules ? (
          <>
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
              // Navigate only: clearing local query here would arm the
              // search debounce, which could replace this navigation
              // with the old status. The loadedQuery effect resets it.
              onViewAll={() => void navigate(buildRulesUrl("all", ""))}
              onPreviousPage={() =>
                void navigate(buildRulesUrl(status, query, page - 1))
              }
              onNextPage={() =>
                void navigate(buildRulesUrl(status, query, page + 1))
              }
            />
            <RulePriorityBar />
          </>
        ) : (
          <RulesEmptyState />
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
