import assert from "node:assert/strict";
import test from "node:test";
import { UpdateManualProductInputSchema } from "@/contracts/products";
import { assertProductEditableInWorkspace } from "./catalogAdministrationService";
import { canApplyDefaultMarkup } from "./catalogService";

test("dados do ERP não recebem markup padrão", () => {
  assert.equal(canApplyDefaultMarkup("erp"), false);
  assert.equal(canApplyDefaultMarkup("manual"), true);
  assert.equal(canApplyDefaultMarkup("bootstrap"), true);
});

test("produto ERP é bloqueado no serviço administrativo", () => {
  assert.throws(
    () => assertProductEditableInWorkspace("erp"),
    (error: unknown) => typeof error === "object" && error !== null && "code" in error && error.code === "ERP_PRODUCT_READ_ONLY",
  );
  assert.doesNotThrow(() => assertProductEditableInWorkspace("manual"));
});

test("payload manual não aceita origem nem campos calculados", () => {
  const valid = {
    name: "Blusa", description: "", category: "Blusas", price: 100,
    variants: [{ color: "Preto", size: "M", price: 100, availability: "in_stock" }],
  };
  assert.equal(UpdateManualProductInputSchema.safeParse(valid).success, true);
  assert.equal(UpdateManualProductInputSchema.safeParse({ ...valid, sourceOrigin: "manual" }).success, false);
  assert.equal(UpdateManualProductInputSchema.safeParse({ ...valid, activeDiscount: { label: "Oferta", percent: 10 } }).success, false);
});
