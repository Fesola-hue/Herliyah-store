export const ALLOWED_SIZES = new Set(["XS", "S", "M", "L", "XL"]);
export const nowIso = () => new Date().toISOString();
export const json = (value: unknown) => JSON.stringify(value ?? null);
export const slugify = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);

export async function writeAudit(
  db: D1Database,
  actorId: string,
  action: string,
  entityType: string,
  entityId: string,
  before: unknown,
  after: unknown,
  reason?: string,
) {
  await db
    .prepare(
      "INSERT INTO admin_audit_log (id,actor_id,action,entity_type,entity_id,before_json,after_json,reason,created_at) VALUES (?,?,?,?,?,?,?,?,?)",
    )
    .bind(
      crypto.randomUUID(),
      actorId,
      action,
      entityType,
      entityId,
      before == null ? null : json(before),
      after == null ? null : json(after),
      reason?.trim() || null,
      nowIso(),
    )
    .run();
}
