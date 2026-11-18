export type NotificationBindings = {
  DB?: D1Database;
  EMAIL_PROVIDER?: "disabled" | "resend";
  EMAIL_PROVIDER_API_KEY?: string;
  EMAIL_FROM?: string;
  PUBLIC_APP_ORIGIN?: string;
};

type OutboxRow = {
  id: string;
  event_type: string;
  payload_json: string;
  attempts: number;
};

const escapeHtml = (value: unknown) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

function retryAt(attempt: number) {
  const delayMinutes = Math.min(24 * 60, 2 ** Math.min(attempt, 10));
  return new Date(Date.now() + delayMinutes * 60_000).toISOString();
}

async function sendResend(
  env: NotificationBindings,
  message: { to: string; subject: string; html: string },
  idempotencyKey: string,
) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.EMAIL_PROVIDER_API_KEY}`,
      "content-type": "application/json",
      "idempotency-key": idempotencyKey,
    },
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      to: [message.to],
      subject: message.subject,
      html: message.html,
    }),
  });
  if (!response.ok) throw new Error(`email_provider_${response.status}`);
}

export async function processNotificationOutbox(
  env: NotificationBindings,
  limit = 10,
) {
  if (!env.DB) return { processed: 0, sent: 0, failed: 0, configured: false };
  const configured =
    env.EMAIL_PROVIDER === "resend" &&
    Boolean(env.EMAIL_PROVIDER_API_KEY && env.EMAIL_FROM);
  if (!configured)
    return { processed: 0, sent: 0, failed: 0, configured: false };

  const now = new Date().toISOString();
  const rows = await env.DB.prepare(
    "SELECT id,event_type,payload_json,attempts FROM notification_outbox WHERE status IN ('pending','retry') AND (next_attempt_at IS NULL OR next_attempt_at<=?) ORDER BY created_at LIMIT ?",
  )
    .bind(now, limit)
    .all<OutboxRow>();
  let sent = 0;
  let failed = 0;
  for (const row of rows.results) {
    const claimed = await env.DB.prepare(
      "UPDATE notification_outbox SET status='processing',updated_at=? WHERE id=? AND status IN ('pending','retry')",
    )
      .bind(now, row.id)
      .run();
    if (!claimed.meta.changes) continue;
    try {
      const payload = JSON.parse(row.payload_json) as { orderId?: string };
      if (!payload.orderId) throw new Error("missing_order_id");
      const order = await env.DB.prepare(
        "SELECT order_number,email,full_name,fulfilment_status,dispatch_min_date,dispatch_max_date,revised_dispatch_min_date,revised_dispatch_max_date,delay_message,courier_name,tracking_reference,tracking_url FROM orders WHERE id=?",
      )
        .bind(payload.orderId)
        .first<Record<string, string | null>>();
      if (!order) throw new Error("order_not_found");
      const confirmation = row.event_type === "order.confirmed";
      const subject = confirmation
        ? `Your HERLIYAH order ${order.order_number} is confirmed`
        : `Update for HERLIYAH order ${order.order_number}`;
      const dispatch = order.revised_dispatch_min_date
        ? `${order.revised_dispatch_min_date}${order.revised_dispatch_max_date ? ` to ${order.revised_dispatch_max_date}` : ""}`
        : `${order.dispatch_min_date ?? "pending"}${order.dispatch_max_date ? ` to ${order.dispatch_max_date}` : ""}`;
      const courier = order.courier_name
        ? `<p>Courier: ${escapeHtml(order.courier_name)}${order.tracking_reference ? ` - ${escapeHtml(order.tracking_reference)}` : ""}</p>`
        : "";
      await sendResend(
        env,
        {
          to: String(order.email),
          subject,
          html: `<p>Hello ${escapeHtml(order.full_name)},</p><p>${confirmation ? "Your payment was verified and your preorder is confirmed." : `Your fulfilment status is now <strong>${escapeHtml(String(order.fulfilment_status).replaceAll("_", " "))}</strong>.`}</p><p>Current dispatch estimate: ${escapeHtml(dispatch)}. Courier delivery begins after dispatch.</p>${order.delay_message ? `<p>${escapeHtml(order.delay_message)}</p>` : ""}${courier}<p>Keep the private tracking details issued at checkout safe.</p>`,
        },
        row.id,
      );
      await env.DB.prepare(
        "UPDATE notification_outbox SET status='sent',attempts=attempts+1,sent_at=?,updated_at=?,last_error=NULL WHERE id=?",
      )
        .bind(now, now, row.id)
        .run();
      sent += 1;
    } catch (error) {
      const attempts = row.attempts + 1;
      const terminal = attempts >= 8;
      await env.DB.prepare(
        "UPDATE notification_outbox SET status=?,attempts=?,next_attempt_at=?,updated_at=?,last_error=? WHERE id=?",
      )
        .bind(
          terminal ? "failed" : "retry",
          attempts,
          terminal ? null : retryAt(attempts),
          now,
          error instanceof Error ? error.message.slice(0, 300) : "unknown_error",
          row.id,
        )
        .run();
      failed += 1;
    }
  }
  return { processed: sent + failed, sent, failed, configured: true };
}
