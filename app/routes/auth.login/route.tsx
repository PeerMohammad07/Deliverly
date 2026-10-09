import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";

import { login } from "../../shopify.server";

// No shop-domain form: installs start only from Shopify surfaces
// (App Store requirement 2.3.1). A valid ?shop= param still goes through
// the library's login, which throws a redirect into Shopify's install flow.
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  if (url.searchParams.get("shop")) {
    await login(request);
  }

  throw redirect("/");
};
