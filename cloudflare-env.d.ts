declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    PRODUCT_IMAGES?: R2Bucket;
    APP_MODE?: "preview" | "test" | "production";
    OWNER_EMAIL?: string;
  }
}
