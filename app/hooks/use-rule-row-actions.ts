import { useEffect, useState } from "react";
import { useFetcher } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import type {
  RuleRowActionData,
  RuleRowIntent,
} from "../services/rule-row-action.server";

/**
 * Shared row-action wiring for every rules table. Owns the fetcher,
 * busy-row tracking, and native toast feedback: toggle success stays
 * silent (the control itself shows server truth), everything else pops.
 */
export function useRuleRowActions() {
  const fetcher = useFetcher<RuleRowActionData>();
  const shopify = useAppBridge();
  const [lastIntent, setLastIntent] = useState<RuleRowIntent | null>(null);

  const busyId =
    fetcher.state !== "idle"
      ? String(fetcher.formData?.get("id") ?? "")
      : "";
  const result =
    fetcher.state === "idle" && fetcher.data ? fetcher.data : undefined;

  useEffect(() => {
    if (!result || !lastIntent) return;
    if (lastIntent === "toggle") {
      if (!result.ok) shopify.toast.show(result.message, { isError: true });
    } else {
      shopify.toast.show(
        result.message,
        result.ok ? undefined : { isError: true },
      );
    }
  }, [result, lastIntent, shopify]);

  function submitIntent(intent: RuleRowIntent, fields: Record<string, string>) {
    setLastIntent(intent);
    fetcher.submit({ intent, ...fields }, { method: "post" });
  }

  return { busyId, submitIntent, shopify };
}
