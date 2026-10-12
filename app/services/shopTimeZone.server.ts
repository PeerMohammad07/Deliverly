const SHOP_TIME_ZONE_QUERY = `query ShopTimeZone {
  shop {
    ianaTimezone
  }
}`;

interface AdminGraphqlClient {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<{ json: () => Promise<unknown> }>;
}

/**
 * The shop's IANA time zone, which the storefront uses for cutoff times.
 * Best-effort: null lets the rule form fall back to the browser's zone.
 */
export async function fetchShopTimeZone(
  admin: AdminGraphqlClient,
): Promise<string | null> {
  try {
    const response = await admin.graphql(SHOP_TIME_ZONE_QUERY);
    const payload: unknown = await response.json();
    const tz = (payload as { data?: { shop?: { ianaTimezone?: unknown } } })
      ?.data?.shop?.ianaTimezone;
    return typeof tz === "string" && tz ? tz : null;
  } catch (error) {
    console.error("[shopTimeZone] lookup failed", error);
    return null;
  }
}
