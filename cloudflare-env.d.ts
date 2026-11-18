declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    PRODUCT_IMAGES?: R2Bucket;
    APP_MODE?: "preview" | "test" | "production";
    PUBLIC_APP_ORIGIN?: string;
    PAYSTACK_SECRET_KEY?: string;
    PAYMENT_PROVIDER?: "disabled" | "paystack";
    PAYMENT_PROVIDER_VERIFIED?: "true" | "false";
    ADMIN_AUTH_MODE?: "disabled" | "cloudflare-access" | "preview-token";
    ADMIN_PREVIEW_TOKEN?: string;
    CF_ACCESS_TEAM_DOMAIN?: string;
    CF_ACCESS_AUD?: string;
    ADMIN_EMAIL_ALLOWLIST?: string;
    EMAIL_PROVIDER?: "disabled" | "resend";
    EMAIL_PROVIDER_API_KEY?: string;
    EMAIL_FROM?: string;
    CUSTOMER_AUTH_ISSUER?: string;
    CUSTOMER_AUTH_JWKS_URL?: string;
    CUSTOMER_AUTH_AUDIENCE?: string;
    CUSTOMER_AUTH_CLIENT_ID?: string;
    CUSTOMER_AUTHORIZATION_URL?: string;
    CUSTOMER_AUTH_TOKEN_URL?: string;
    CUSTOMER_SESSION_SECRET?: string;
  }
}
