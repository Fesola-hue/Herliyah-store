import { createRemoteJWKSet, jwtVerify, SignJWT } from "jose";

export type CustomerAuthBindings = {
  DB?: D1Database;
  CUSTOMER_AUTH_ISSUER?: string;
  CUSTOMER_AUTH_JWKS_URL?: string;
  CUSTOMER_AUTH_AUDIENCE?: string;
  CUSTOMER_AUTH_CLIENT_ID?: string;
  CUSTOMER_AUTHORIZATION_URL?: string;
  CUSTOMER_AUTH_TOKEN_URL?: string;
  CUSTOMER_SESSION_SECRET?: string;
  PUBLIC_APP_ORIGIN?: string;
};

type CustomerIdentity = { id: string; email: string; subject: string };

const encoder = new TextEncoder();
const sessionCookie = "herliyah_customer_session";

function cookieValue(request: Request, name: string) {
  const cookies = request.headers.get("cookie") ?? "";
  for (const part of cookies.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return decodeURIComponent(value.join("="));
  }
  return "";
}

function sessionKey(env: CustomerAuthBindings) {
  if (!env.CUSTOMER_SESSION_SECRET || env.CUSTOMER_SESSION_SECRET.length < 32)
    throw new Error("customer_auth_not_configured");
  return encoder.encode(env.CUSTOMER_SESSION_SECRET);
}

export function customerAuthConfigured(env: CustomerAuthBindings) {
  return Boolean(
    env.DB &&
      env.CUSTOMER_AUTH_ISSUER &&
      env.CUSTOMER_AUTH_JWKS_URL &&
      env.CUSTOMER_AUTH_AUDIENCE &&
      env.CUSTOMER_AUTH_CLIENT_ID &&
      env.CUSTOMER_AUTHORIZATION_URL &&
      env.CUSTOMER_AUTH_TOKEN_URL &&
      (env.CUSTOMER_SESSION_SECRET?.length ?? 0) >= 32,
  );
}

async function ensureCustomer(
  db: D1Database,
  subject: string,
  email: string,
) {
  const normalized = email.trim().toLowerCase();
  let customer = await db
    .prepare("SELECT id,auth_subject,verified_email FROM customers WHERE auth_subject=? OR verified_email=? LIMIT 1")
    .bind(subject, normalized)
    .first<{ id: string; auth_subject: string | null; verified_email: string }>();
  if (!customer) {
    const id = crypto.randomUUID();
    await db
      .prepare("INSERT INTO customers (id,auth_subject,verified_email,created_at) VALUES (?,?,?,?)")
      .bind(id, subject, normalized, new Date().toISOString())
      .run();
    customer = { id, auth_subject: subject, verified_email: normalized };
  } else if (!customer.auth_subject) {
    await db
      .prepare("UPDATE customers SET auth_subject=? WHERE id=? AND auth_subject IS NULL")
      .bind(subject, customer.id)
      .run();
  } else if (customer.auth_subject !== subject) {
    throw new Error("email_already_linked");
  }
  await db
    .prepare("UPDATE orders SET customer_id=? WHERE customer_id IS NULL AND lower(email)=?")
    .bind(customer.id, normalized)
    .run();
  await db
    .prepare("INSERT OR IGNORE INTO wishlists (id,customer_id,created_at) VALUES (?,?,?)")
    .bind(crypto.randomUUID(), customer.id, new Date().toISOString())
    .run();
  return { id: customer.id, email: normalized, subject };
}

export async function exchangeCustomerCode(
  env: CustomerAuthBindings,
  input: { code?: string; verifier?: string; redirectUri?: string },
) {
  if (!customerAuthConfigured(env) || !env.DB)
    throw new Error("customer_auth_not_configured");
  const origin = env.PUBLIC_APP_ORIGIN?.replace(/\/$/, "");
  const expectedRedirect = `${origin}/account`;
  if (!origin || input.redirectUri !== expectedRedirect || !input.code || !input.verifier)
    throw new Error("invalid_auth_exchange");
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: env.CUSTOMER_AUTH_CLIENT_ID!,
    code: input.code,
    code_verifier: input.verifier,
    redirect_uri: expectedRedirect,
  });
  const response = await fetch(env.CUSTOMER_AUTH_TOKEN_URL!, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!response.ok) throw new Error("identity_exchange_failed");
  const tokens = (await response.json()) as { id_token?: string };
  if (!tokens.id_token) throw new Error("identity_token_missing");
  const { payload } = await jwtVerify(
    tokens.id_token,
    createRemoteJWKSet(new URL(env.CUSTOMER_AUTH_JWKS_URL!)),
    { issuer: env.CUSTOMER_AUTH_ISSUER, audience: env.CUSTOMER_AUTH_AUDIENCE },
  );
  if (payload.email_verified !== true || typeof payload.email !== "string" || !payload.sub)
    throw new Error("verified_email_required");
  const customer = await ensureCustomer(env.DB, String(payload.sub), payload.email);
  const token = await new SignJWT({ email: customer.email, customerId: customer.id })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer("herliyah-store")
    .setSubject(customer.subject)
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(sessionKey(env));
  return {
    customer,
    cookie: `${sessionCookie}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800${origin.startsWith("https://") ? "; Secure" : ""}`,
  };
}

export async function requireCustomer(
  request: Request,
  env: CustomerAuthBindings,
): Promise<CustomerIdentity> {
  if (!env.DB) throw new Error("customer_auth_not_configured");
  const token = cookieValue(request, sessionCookie);
  if (!token) throw new Error("customer_unauthorized");
  const { payload } = await jwtVerify(token, sessionKey(env), {
    issuer: "herliyah-store",
  });
  if (!payload.customerId || !payload.email || !payload.sub)
    throw new Error("customer_unauthorized");
  const row = await env.DB
    .prepare("SELECT id,verified_email,auth_subject FROM customers WHERE id=? AND auth_subject=?")
    .bind(String(payload.customerId), String(payload.sub))
    .first<{ id: string; verified_email: string; auth_subject: string }>();
  if (!row || row.verified_email !== payload.email)
    throw new Error("customer_unauthorized");
  return { id: row.id, email: row.verified_email, subject: row.auth_subject };
}

export const clearCustomerCookie = `${sessionCookie}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
