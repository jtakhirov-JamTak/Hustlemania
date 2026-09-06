import type { Instrumentation } from "next";
import { report } from "@/lib/observe";

/**
 * Every error Next catches while rendering, running a route handler, a server action
 * or the proxy lands here — the read loaders throw on a failed query, and without this
 * that throw is only a default error page and a line of function stdout nobody reads.
 */
export const onRequestError: Instrumentation.onRequestError = (error, request, context) => {
  report("request.error", error, {
    path: request.path,
    method: request.method,
    route: context.routePath,
    routeType: context.routeType,
    renderSource: context.renderSource ?? null,
  });
};
