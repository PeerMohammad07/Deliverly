import { boundary } from "@shopify/shopify-app-react-router/server";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { data, redirect, useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import {
  getRuleForEdit,
  updateDeliveryRule,
} from "../services/deliveryRule.service.server";
import { RuleNotFoundError } from "../repositories/deliveryRule.repository.server";
import {
  parseRuleFormData,
  validateRuleInput,
  type RuleFormErrors,
} from "../validators/deliveryRule.validator";
import {
  DEFAULT_MESSAGE_PARTS,
  parseExcludedDays,
  parseStoredMessage,
} from "../utils/delivery-dates";
import { actionValues } from "../utils/action-values";
import {
  RuleForm,
  type RuleFormActionData,
  type RuleFormInitial,
} from "../components/rule-form";

const RULE_TITLES_QUERY = `query RuleTargetTitles($ids: [ID!]!) {
  nodes(ids: $ids) {
    id
    ... on Product {
      title
    }
    ... on Collection {
      title
    }
  }
}`;

interface AdminGraphqlClient {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<{ json: () => Promise<unknown> }>;
}

/**
 * Resolve stored target GIDs to display titles via Admin API.
 * Best-effort: unknown IDs fall back to the raw GID so the form
 * always stays usable.
 */
async function resolveTargetTitles(
  admin: AdminGraphqlClient,
  ids: string[],
): Promise<Record<string, string>> {
  if (ids.length === 0) return {};
  try {
    const response = await admin.graphql(RULE_TITLES_QUERY, {
      variables: { ids },
    });
    const payload: unknown = await response.json();
    const nodes = (payload as { data?: { nodes?: unknown } })?.data?.nodes;
    if (!Array.isArray(nodes)) return {};
    const titles: Record<string, string> = {};
    for (const node of nodes) {
      if (node && typeof node === "object") {
        const record = node as { id?: unknown; title?: unknown };
        if (
          typeof record.id === "string" &&
          typeof record.title === "string" &&
          record.title.length > 0
        ) {
          titles[record.id] = record.title;
        }
      }
    }
    return titles;
  } catch (error) {
    console.error("[app.rules.$ruleId] target title lookup failed", error);
    return {};
  }
}

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = (session as { shop?: string })?.shop;
  if (!shop) {
    throw new Response("Unauthorized: missing shop", { status: 401 });
  }
  const id = params.ruleId;
  if (!id) {
    throw new Response("Rule not found", { status: 404 });
  }

  let rule;
  try {
    rule = await getRuleForEdit(shop, id);
  } catch (error) {
    if (error instanceof RuleNotFoundError) {
      throw new Response("Rule not found", { status: 404 });
    }
    throw error;
  }

  const targetIds = rule.targets.map((t) => t.targetId);
  const titles = await resolveTargetTitles(admin, targetIds);
  const parts = parseStoredMessage(rule.customMessage) ?? {
    ...DEFAULT_MESSAGE_PARTS,
    prefix: rule.customMessage,
  };

  const initial: RuleFormInitial = {
    name: rule.name,
    type: rule.type,
    targets: rule.targets.map((t) => ({
      id: t.targetId,
      title: titles[t.targetId] ?? t.targetId,
    })),
    processingDays: String(rule.processingDays),
    minDeliveryDays: String(rule.minDeliveryDays),
    maxDeliveryDays: String(rule.maxDeliveryDays),
    excludedDays: [...parseExcludedDays(rule.excludedDays)].sort(
      (a, b) => a - b,
    ),
    msgPrefix: parts.prefix,
    msgSeparator: parts.separator,
    msgSuffix: parts.suffix,
    dateStyle: parts.dateStyle,
    enabled: rule.enabled,
  };

  return { initial, ruleId: id };
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = (session as { shop?: string })?.shop;
  if (!shop) {
    throw new Response("Unauthorized: missing shop", { status: 401 });
  }
  const id = params.ruleId;
  if (!id) {
    throw new Response("Rule not found", { status: 404 });
  }

  const formData = await request.formData();
  const parsed = parseRuleFormData(formData);

  const checked = validateRuleInput(parsed);
  if (!checked.valid || !checked.value) {
    return data<RuleFormActionData>(
      { errors: checked.errors, values: actionValues(formData) },
      { status: 400 },
    );
  }

  try {
    await updateDeliveryRule(shop, id, checked.value);
    return redirect("/app/rules?notice=updated");
  } catch (error) {
    if (error instanceof RuleNotFoundError) {
      return data<RuleFormActionData>(
        {
          errors: {},
          formError:
            "This rule no longer exists. Return to the rules list and try again.",
          values: actionValues(formData),
        },
        { status: 404 },
      );
    }
    console.error("[app.rules.$ruleId] update failed", { shop, id, error });
    const fieldErrors =
      (error as { fieldErrors?: RuleFormErrors }).fieldErrors ?? {};
    const validationFailure = Object.keys(fieldErrors).length > 0;
    return data<RuleFormActionData>(
      {
        errors: validationFailure
          ? fieldErrors
          : {},
        formError: validationFailure
          ? undefined
          : "Something went wrong while saving. Try again.",
        values: actionValues(formData),
      },
      { status: validationFailure ? 400 : 500 },
    );
  }
};

export default function EditEtaRulePage() {
  const { initial, ruleId } = useLoaderData<typeof loader>();
  return (
    <RuleForm
      key={ruleId}
      initial={initial}
      labels={{
        title: "Edit rule",
        subtitle:
          "Update when this rule applies and how delivery dates are calculated.",
      }}
    />
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
