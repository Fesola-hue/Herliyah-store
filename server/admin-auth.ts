import { createRemoteJWKSet, jwtVerify } from "jose";
import type { Context, Next } from "hono";

export type AdminBindings = {
  ADMIN_AUTH_MODE?: "disabled" | "cloudflare-access";
  CF_ACCESS_TEAM_DOMAIN?: string;
  CF_ACCESS_AUD?: string;
  ADMIN_EMAIL_ALLOWLIST?: string;
};

export async function requireAdmin(
  c: Context<{ Bindings: AdminBindings; Variables: { adminId: string } }>,
  next: Next,
) {
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
