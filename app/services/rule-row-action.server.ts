import {
  DefaultDeleteForbiddenError,
  DuplicateDefaultRuleError,
  RuleNotFoundError,
} from "../repositories/deliveryRule.repository.server";
import {
  deleteDeliveryRule,
  duplicateDeliveryRule,
  setRuleEnabledState,
} from "./deliveryRule.service.server";

export interface RuleRowActionData {
  ok: boolean;
  id?: string;
  enabled?: boolean;
  message: string;
}

export type RuleRowIntent = "toggle" | "delete" | "duplicate";

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
  const id = String(formData.get("id") ?? "");
  if (!id) {
    return { ok: false, message: "Missing rule." };
  }

  try {
    if (intent === "toggle") {
      const raw = String(formData.get("enabled") ?? "");
      if (raw !== "true" && raw !== "false") {
        return { ok: false, id, message: "Invalid status." };
      }
      const rule = await setRuleEnabledState(shop, id, raw === "true");
      return {
        ok: true,
        id: rule.id,
        enabled: rule.enabled,
        message: `“${rule.name}” is now ${rule.enabled ? "active" : "inactive"}.`,
      };
    }

    if (intent === "delete") {
      const deleted = await deleteDeliveryRule(shop, id);
      return {
        ok: true,
        id: deleted.id,
        message: `Deleted “${deleted.name}”.`,
      };
    }

    if (intent === "duplicate") {
      try {
        const copy = await duplicateDeliveryRule(shop, id);
        return {
          ok: true,
          id: copy.id,
          message: `Duplicated as “${copy.name}”.`,
        };
      } catch (error) {
        console.error("[rule-row-action] duplicate failed", {
          shop,
          id,
          error,
        });
        if (error instanceof DuplicateDefaultRuleError) {
          return {
            ok: false,
            id,
            message: "The default rule can’t be duplicated.",
          };
        }
        if (error instanceof RuleNotFoundError) {
          return {
            ok: false,
            id,
            message:
              "That rule no longer exists. The list has been refreshed.",
          };
        }
        return {
          ok: false,
          id,
          message: "Something went wrong. Try again.",
        };
      }
    }

    return { ok: false, message: "Unknown action." };
  } catch (error) {
    console.error("[rule-row-action] failed", { shop, intent, id, error });
    if (error instanceof DefaultDeleteForbiddenError) {
      return {
        ok: false,
        id,
        message:
          "The default rule can’t be deleted. Disable it or edit it instead.",
      };
    }
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
