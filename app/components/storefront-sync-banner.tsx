import { useEffect } from "react";
import { useFetcher } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import type { SyncResult, SyncStatus } from "../services/storefrontSync.server";

/**
 * Tells the merchant when the storefront isn't showing their latest
 * rules (the config metafield failed to update) and lets them retry.
 */
export function StorefrontSyncBanner({ status }: { status: SyncStatus }) {
  const fetcher = useFetcher<SyncResult>();
  const shopify = useAppBridge();
  const retrying = fetcher.state !== "idle";

  useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data) return;
    shopify.toast.show(
      fetcher.data.ok
        ? "Storefront updated."
        : "Still couldn’t update the storefront. Try again in a minute.",
      { isError: !fetcher.data.ok },
    );
  }, [fetcher.state, fetcher.data, shopify]);

  if (status.state === "too_large") {
    return (
      <s-banner tone="info" heading="Estimates load from our server">
        Your rules are too large to store in your theme, so the storefront
        loads estimates from Deliverly instead. They still show correctly,
        just a little slower. Fewer products per rule brings back the faster
        loading.
      </s-banner>
    );
  }
  if (status.state !== "out_of_date") return null;

  return (
    <s-banner tone="warning" heading="Storefront isn’t showing your latest rules">
      <s-paragraph>
        Your changes are saved, but we couldn’t send them to your store yet.
        Shoppers still see the previous estimates.
      </s-paragraph>
      <s-button
        slot="secondary-actions"
        loading={retrying ? true : undefined}
        disabled={retrying}
        onClick={() =>
          fetcher.submit(null, {
            method: "post",
            action: "/app/storefront-sync",
          })
        }
      >
        Retry
      </s-button>
    </s-banner>
  );
}
