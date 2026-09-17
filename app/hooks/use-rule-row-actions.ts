import { useEffect, useRef } from "react";
import { useFetcher } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import type {
  RuleRowActionData,
  RuleRowIntent,
} from "../services/rule-row-action.server";

/**
 * Shared row-action wiring for every rules table. Owns the fetcher,
 * busy-row tracking, and native toast feedback.
 */
export function useRuleRowActions() {
  const fetcher = useFetcher<RuleRowActionData>();
  const shopify = useAppBridge();
  // fetcher.data keeps the last server response until the next one
  // arrives. Without this guard, a later render (e.g. toggling after a
  // failed delete) would re-toast that stale payload under the new
  // intent — e.g. showing the delete error for a toggle.
  const toastedResult = useRef<RuleRowActionData | null>(null);

  const busyId =
    fetcher.state !== "idle"
      ? String(fetcher.formData?.get("id") ?? "")
      : "";
  const result =
    fetcher.state === "idle" && fetcher.data ? fetcher.data : undefined;

  useEffect(() => {
    if (!result) return;
    if (toastedResult.current === result) return;
    toastedResult.current = result;
    shopify.toast.show(
      result.message,
      result.ok ? undefined : { isError: true },
    );
  }, [result, shopify]);

  function submitIntent(intent: RuleRowIntent, fields: Record<string, string>) {
    if (fetcher.state !== "idle") return;
    toastedResult.current = null;
    fetcher.submit({ intent, ...fields }, { method: "post" });
  }

  return { busyId, submitIntent, shopify };
}
