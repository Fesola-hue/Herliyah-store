import handler from "vinext/server/fetch-handler";
import { runWithConnectorBinding } from "../lib/connector-context";
import type { ConnectorBinding } from "../lib/connector-contract.mjs";
import { api } from "../server/api";
import {
  reconcileExpiredPayments,
  releaseExpiredReservations,
} from "../server/checkout-service.mjs";
import { PaystackTestAdapter } from "../server/payment-adapter";

export default {
  fetch(
    request: Request,
    env: Cloudflare.Env,
    ctx: ExecutionContext<{ CONNECTORS?: ConnectorBinding }>,
  ) {
    if (new URL(request.url).pathname.startsWith("/api/")) {
      return api.fetch(request, env, ctx);
    }
    let binding = ctx.props?.CONNECTORS;
    // Local preview emulates the same request-scoped capability. This branch and
    // the auxiliary service binding are absent from production builds.
    if (import.meta.env.DEV && !binding && env.CONNECTORS) {
      const preview = env.CONNECTORS;
      const expiresAt = Date.now() + 60_000;
      binding = {
        async getContext() {
          if (Date.now() >= expiresAt)
            return { status: "request_context_expired" };
          return preview.getContext?.() ?? { status: "binding_unavailable" };
        },
        async invoke(connectorId, actionName, args) {
          if (Date.now() >= expiresAt) {
            return {
              status: "request_context_expired",
              message: "This request has expired. Please try again.",
            };
          }
          return preview.invoke(connectorId, actionName, args);
        },
      };
    }
    return runWithConnectorBinding(binding, () =>
      handler.fetch(request, env, ctx),
    );
  },
  async scheduled(
    _controller: ScheduledController,
    env: Cloudflare.Env,
    ctx: ExecutionContext,
  ) {
    if (!env.DB) return;
    const mode = env.APP_MODE ?? "preview";
    if (mode === "preview") {
      ctx.waitUntil(releaseExpiredReservations(env.DB));
      return;
    }
    if (mode === "test" && env.PAYSTACK_SECRET_KEY?.startsWith("sk_test_")) {
      const adapter = new PaystackTestAdapter(env.PAYSTACK_SECRET_KEY);
      ctx.waitUntil(
        reconcileExpiredPayments(env.DB, (reference: string) =>
          adapter.verify(reference),
        ),
      );
    }
  },
};
