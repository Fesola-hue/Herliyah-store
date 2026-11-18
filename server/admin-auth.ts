import { createRemoteJWKSet, jwtVerify } from "jose";
import type { Context, Next } from "hono";

export type AdminBindings = {
  ADMIN_AUTH_MODE?: "disabled" | "cloudflare-access" | "preview-token";
  APP_MODE?: "preview" | "test" | "production";
  ADMIN_PREVIEW_TOKEN?: string;
  CF_ACCESS_TEAM_DOMAIN?: string;
  CF_ACCESS_AUD?: string;
  ADMIN_EMAIL_ALLOWLIST?: string;
};

export async function isLocalPreviewAdminRequest(
  request: Request,
  env: AdminBindings,
) {
  const hostname = new URL(request.url).hostname;
  if (
    env.ADMIN_AUTH_MODE !== "preview-token" ||
    env.APP_MODE !== "preview" ||
    (hostname !== "127.0.0.1" && hostname !== "localhost") ||
    (env.ADMIN_PREVIEW_TOKEN?.length ?? 0) < 16
  )
    return false;
  const supplied = request.headers.get("x-herliyah-admin-token") ?? "";
  const encoder = new TextEncoder();
  const [left, right] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(supplied)),
    crypto.subtle.digest("SHA-256", encoder.encode(env.ADMIN_PREVIEW_TOKEN)),
  ]);
  const a = new Uint8Array(left);
  const b = new Uint8Array(right);
  let mismatch = a.length ^ b.length;
  for (let index = 0; index < a.length; index += 1)
    mismatch |= a[index] ^ b[index % b.length];
  return mismatch === 0;
}

export async function requireAdmin(
  c: Context<{ Bindings: AdminBindings; Variables: { adminId: string } }>,
  next: Next,
) {
  if (c.env.ADMIN_AUTH_MODE === "preview-token") {
    if (await isLocalPreviewAdminRequest(c.req.raw, c.env)) {
      c.set("adminId", "local-preview-owner");
      await next();
      return;
    }
    return c.json({ error: "forbidden" }, 403);
  }
  if (
    c.env.ADMIN_AUTH_MODE !== "cloudflare-access" ||
    !c.env.CF_ACCESS_TEAM_DOMAIN ||
    !c.env.CF_ACCESS_AUD
  )
    return c.json({ error: "admin_access_disabled" }, 503);
  const token = c.req.header("cf-access-jwt-assertion");
  if (!token) return c.json({ error: "forbidden" }, 403);
  const issuer = c.env.CF_ACCESS_TEAM_DOMAIN.replace(/\/$/, "");
  try {
    const { payload } = await jwtVerify(
      token,
      createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`)),
      { issuer, audience: c.env.CF_ACCESS_AUD },
    );
    const email =
      typeof payload.email === "string" ? payload.email.toLowerCase() : "";
    const allowed = new Set(
      (c.env.ADMIN_EMAIL_ALLOWLIST ?? "")
        .split(",")
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean),
    );
    if (!email || !allowed.has(email))
      return c.json({ error: "forbidden" }, 403);
    c.set("adminId", String(payload.sub ?? email));
    await next();
  } catch (error) {
    console.error(
      JSON.stringify({
        message: "admin_access_validation_failed",
        error: error instanceof Error ? error.message : "unknown",
      }),
    );
    return c.json({ error: "forbidden" }, 403);
  }
}
