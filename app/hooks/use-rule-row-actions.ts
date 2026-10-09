import { useEffect, useRef, useState } from "react";
import { useFetcher } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import type {
  RuleRowActionData,
  RuleRowIntent,
} from "../services/rule-row-action.server";

/**
 * Shared row-action wiring for every rules table. Owns the fetcher,
 * busy-row tracking, and feedback: successes toast, failures are kept
 * in `error` so the page can show a persistent banner (toasts auto-hide).
 */
export function useRuleRowActions() {
  const fetcher = useFetcher<RuleRowActionData>();
  const shopify = useAppBridge();
  // fetcher.data keeps the last server response until the next one
  // arrives. Without this guard, a later render (e.g. toggling after a
  // failed delete) would re-toast that stale payload under the new
  // intent — e.g. showing the delete error for a toggle.
  const toastedResult = useRef<RuleRowActionData | null>(null);
  const [error, setError] = useState<string | null>(null);

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
    if (result.ok) {
      shopify.toast.show(result.message);
    } else {
      setError(result.message);
    }
  }, [result, shopify]);

  function submitIntent(intent: RuleRowIntent, fields: Record<string, string>) {
    if (fetcher.state !== "idle") return;
    toastedResult.current = null;
    setError(null);
    fetcher.submit({ intent, ...fields }, { method: "post" });
  }

  return {
    busyId,
    submitIntent,
    shopify,
    error,
    clearError: () => setError(null),
    showError: setError,
  };
}
