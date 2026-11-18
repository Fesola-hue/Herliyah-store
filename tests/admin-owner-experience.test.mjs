import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const workspace = await readFile(
  new URL("../app/admin/admin-product-workspace.tsx", import.meta.url),
  "utf8",
);
const dashboard = await readFile(
  new URL("../app/admin/admin-dashboard.tsx", import.meta.url),
  "utf8",
);
const settings = await readFile(
  new URL("../app/admin/admin-settings-owner.tsx", import.meta.url),
  "utf8",
);
const orders = await readFile(
  new URL("../app/admin/admin-orders-owner.tsx", import.meta.url),
  "utf8",
);

test("active owner product editor uses retail language instead of storage terms", () => {
  assert.match(dashboard, /admin-product-workspace/);
  assert.match(workspace, /Price \(₦\)/);
  assert.match(workspace, /Maximum orders you can accept/);
  assert.match(workspace, /Measurement unit/);
  assert.match(workspace, /Care instructions/);
  assert.match(workspace, /generated automatically/);
  assert.doesNotMatch(workspace, /Price \(kobo\)/i);
  assert.doesNotMatch(workspace, /Measurements JSON/i);
  assert.doesNotMatch(workspace, />Size guide key</i);
  assert.doesNotMatch(workspace, />Audit reason</i);
});

test("active settings and orders use owner-facing forms and labels", () => {
  assert.match(dashboard, /admin-settings-owner/);
  assert.match(dashboard, /admin-orders-owner/);
  assert.match(settings, /Delivery fee \(₦\)/);
  assert.match(settings, /Minimum delivery days/);
  assert.match(settings, /Maximum delivery days/);
  assert.match(settings, /Save homepage order/);
  assert.doesNotMatch(
    settings,
    /Structured JSON|fee Kobo|transit Min Days|transit Max Days/i,
  );
  assert.match(orders, /Test order · no real payment/);
  assert.match(orders, /Waiting to be made/);
  assert.match(orders, /Payment and fulfilment are separate/);
});

test("private preview contains every customer-facing product section", () => {
  for (const label of [
    "Private preview",
    "Colours",
    "Sizes",
    "Measurements",
    "Care instructions",
    "Ready to dispatch",
    "Courier delivery begins after dispatch",
  ])
    assert.match(workspace, new RegExp(label));
  assert.match(workspace, /Publish product/);
  assert.match(workspace, /View live product/);
  assert.match(workspace, /Unpublish product/);
  assert.match(workspace, /Saved draft\. Private/);
  assert.match(workspace, /Unsaved changes/);
  assert.match(workspace, /Published\. Visible in the online shop/);
  assert.doesNotMatch(
    `${workspace}\n${settings}\n${orders}\n${dashboard}`,
    /—/,
  );
});
