import { RuleNotFoundError } from "../repositories/deliveryRule.repository.server";
import {
  deleteDeliveryRule,
  toggleRuleEnabledState,
} from "./deliveryRule.service.server";

export interface RuleRowActionData {
  ok: boolean;
  id?: string;
  enabled?: boolean;
  message: string;
}

export type RuleRowIntent = "toggle" | "delete";

/**
 * Shared row-action handler for every rules table (list page, dashboard).
 * Returns plain data payloads — callers wrap with data() so responses
 * never throw to the boundary and row actions update in place with
 * toast feedback. Shop comes from the caller (authenticated session),
 * never from the form.
 */
export async function handleRuleRowAction(
  shop: string,
  formData: FormData,
): Promise<RuleRowActionData> {
  const intent = String(formData.get("intent") ?? "");
  const id = String(formData.get("id") ?? "").trim();
  if (intent !== "toggle" && intent !== "delete") {
    return { ok: false, message: "Unknown action." };
  }
  if (!id || id.length > 128) {
    return { ok: false, message: "Invalid rule." };
  }

  try {
    if (intent === "toggle") {
      const rule = await toggleRuleEnabledState(shop, id);
      return {
        ok: true,
        id: rule.id,
        enabled: rule.enabled,
        message: `${rule.name} is now ${rule.enabled ? "active" : "inactive"}.`,
      };
    }

    if (intent === "delete") {
      const deleted = await deleteDeliveryRule(shop, id);
      return {
        ok: true,
        id: deleted.id,
        message: `Deleted ${deleted.name}.`,
      };
    }
    return { ok: false, message: "Unknown action." };
  } catch (error) {
    console.error("[rule-row-action] failed", { shop, intent, id, error });
    if (error instanceof RuleNotFoundError) {
      return {
        ok: false,
        id,
        message: "That rule no longer exists. The list has been refreshed.",
      };
    }
    return {
      ok: false,
      id,
      message: "Something went wrong. Try again.",
    };
  }
}
