"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { customerRequisitesSchema } from "@/domain/customer/requisites";
import { priceFormulaSchema } from "@/domain/supplier/price-economics";
import { SupplierStageError } from "@/domain/supplier/stages";
import { ForbiddenError } from "@/server/errors";
import {
  createSupplier,
  deleteSupplier,
  setSupplierActions,
  setSupplierPriceFormula,
  setSupplierProfitCommission,
  setSupplierStages,
  SupplierInUseError,
  updateSupplier,
} from "@/server/suppliers/service";
import { requireUser } from "@/server/session";

export type SupplierResult = { ok: true; message: string } | { ok: false; error: string };

export type CreateSupplierResult = { ok: true; id: string } | { ok: false; error: string };

const supplierSchema = z.object({
  type: z.enum(["PERSON", "COMPANY"]),
  name: z.string().trim().min(1, { error: "Укажите имя или название" }),
  phone: z.string().optional(),
  email: z.string().optional(),
  inn: z.string().optional(),
  kpp: z.string().optional(),
  contactPerson: z.string().optional(),
  address: z.string().optional(),
  requisites: customerRequisitesSchema.optional(),
  comment: z.string().optional(),
});

const stagesSchema = z.array(z.object({ id: z.string().min(1).optional(), name: z.string() }));

function toError(error: unknown): { ok: false; error: string } {
  if (
    error instanceof ForbiddenError ||
    error instanceof SupplierStageError ||
    error instanceof SupplierInUseError ||
    error instanceof Error
  ) {
    return { ok: false, error: error.message };
  }
  throw error;
}

async function run(action: () => Promise<unknown>, message: string, supplierId?: string): Promise<SupplierResult> {
  try {
    await action();
    revalidatePath("/suppliers");
    if (supplierId) revalidatePath(`/suppliers/${supplierId}`);
    return { ok: true, message };
  } catch (error) {
    return toError(error);
  }
}

/** Заведение поставщика вместе с цепочкой этапов — её обычно знают сразу. */
export async function createSupplierAction(
  input: z.input<typeof supplierSchema>,
  stages: z.input<typeof stagesSchema> = [],
): Promise<CreateSupplierResult> {
  const user = await requireUser();
  const parsed = supplierSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: z.prettifyError(parsed.error) };
  const parsedStages = stagesSchema.safeParse(stages);
  if (!parsedStages.success) return { ok: false, error: z.prettifyError(parsedStages.error) };

  try {
    const supplier = await createSupplier(parsed.data, user);
    if (parsedStages.data.length > 0) await setSupplierStages(supplier.id, parsedStages.data, user);
    revalidatePath("/suppliers");
    return { ok: true, id: supplier.id };
  } catch (error) {
    return toError(error);
  }
}

export async function updateSupplierAction(id: string, input: z.input<typeof supplierSchema>): Promise<SupplierResult> {
  const user = await requireUser();
  const parsed = supplierSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: z.prettifyError(parsed.error) };

  return run(() => updateSupplier(id, parsed.data, user), "Поставщик сохранён", id);
}

export async function setSupplierStagesAction(
  id: string,
  stages: z.input<typeof stagesSchema>,
): Promise<SupplierResult> {
  const user = await requireUser();
  const parsed = stagesSchema.safeParse(stages);
  if (!parsed.success) return { ok: false, error: z.prettifyError(parsed.error) };

  return run(() => setSupplierStages(id, parsed.data, user), "Цепочка этапов сохранена", id);
}

export async function setSupplierActionsAction(id: string, keys: string[]): Promise<SupplierResult> {
  const user = await requireUser();
  const parsed = z.array(z.string()).safeParse(keys);
  if (!parsed.success) return { ok: false, error: z.prettifyError(parsed.error) };

  return run(() => setSupplierActions(id, parsed.data, user), "Действия сохранены", id);
}

export async function setSupplierPriceFormulaAction(id: string, formula: unknown): Promise<SupplierResult> {
  const user = await requireUser();
  const parsed = priceFormulaSchema.safeParse(formula);
  if (!parsed.success) return { ok: false, error: z.prettifyError(parsed.error) };

  return run(() => setSupplierPriceFormula(id, parsed.data, user), "Экономика цены сохранена", id);
}

export async function setSupplierProfitCommissionAction(id: string, hundredths: number): Promise<SupplierResult> {
  const user = await requireUser();
  const parsed = z
    .number()
    .int()
    .min(0)
    .max(10_000, { error: "Комиссия с прибыли — от 0 до 100%" })
    .safeParse(hundredths);
  if (!parsed.success) return { ok: false, error: z.prettifyError(parsed.error) };

  return run(() => setSupplierProfitCommission(id, parsed.data, user), "Комиссия с прибыли сохранена", id);
}

/** После удаления карточки нет — форма уводит в список. */
export async function deleteSupplierAction(id: string): Promise<SupplierResult> {
  const user = await requireUser();
  return run(() => deleteSupplier(id, user), "Поставщик удалён");
}
