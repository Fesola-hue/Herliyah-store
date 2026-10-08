declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    PRODUCT_IMAGES?: R2Bucket;
    APP_MODE?: "preview" | "test" | "production";
    PUBLIC_APP_ORIGIN?: string;
    PAYSTACK_SECRET_KEY?: string;
    ADMIN_AUTH_MODE?: "disabled" | "cloudflare-access";
    CF_ACCESS_TEAM_DOMAIN?: string;
    CF_ACCESS_AUD?: string;
    ADMIN_EMAIL_ALLOWLIST?: string;
  }
}
