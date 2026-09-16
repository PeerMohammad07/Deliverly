import { Outlet } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

// Layout for /app/rules/* — authenticates once, children render via Outlet.
// The list lives in app.rules._index.tsx, the builder in app.rules.new.tsx.
// (Without this Outlet, app.rules.new rendered inside app.rules, which has
// no Outlet — the URL changed but the form never appeared.)
export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return null;
};

export default function EtaRulesLayout() {
  return <Outlet />;
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
