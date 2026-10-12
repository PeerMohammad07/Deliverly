import { renderToReadableStream } from "react-dom/server";
import { ServerRouter } from "react-router";
import { type EntryContext } from "react-router";
import { isbot } from "isbot";
import { addDocumentResponseHeaders } from "./shopify.server";

export const streamTimeout = 5000;

/**
 * Web-streams rendering: Cloudflare Workers have no Node streams, so
 * this uses renderToReadableStream instead of renderToPipeableStream.
 */
export default async function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  reactRouterContext: EntryContext,
) {
  addDocumentResponseHeaders(request, responseHeaders);

  // Abort the React renderer after 6 seconds, which gives React enough
  // time to flush down the rejected boundary contents.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), streamTimeout + 1000);

  let shellRendered = false;
  const body = await renderToReadableStream(
    <ServerRouter context={reactRouterContext} url={request.url} />,
    {
      signal: controller.signal,
      onError(error: unknown) {
        responseStatusCode = 500;
        // Errors before the shell renders reject the promise above and
        // are logged by React Router; only log the later ones here.
        if (shellRendered) console.error(error);
      },
    },
  );
  shellRendered = true;
  body.allReady.then(() => clearTimeout(timeout)).catch(() => {});

  // Bots get the full page at once instead of a stream.
  if (isbot(request.headers.get("user-agent") ?? "")) {
    await body.allReady;
  }

  responseHeaders.set("Content-Type", "text/html");
  return new Response(body, {
    headers: responseHeaders,
    status: responseStatusCode,
  });
}
