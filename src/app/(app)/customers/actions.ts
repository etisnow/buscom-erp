"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ForbiddenError } from "@/server/errors";
import { lookupCustomers, type CustomerMatch } from "@/server/customers/lookup";
import {
  addCustomerAddress,
  createCustomer,
  CustomerExistsError,
  deleteCustomerAddress,
  mergeCustomers,
  updateCustomer,
} from "@/server/customers/service";
import { requireUser } from "@/server/session";

export type CustomerResult = { ok: true; message: string } | { ok: false; error: string };

/** Результат заведения клиента: id — чтобы форма ушла в его карточку. */
export type CreateCustomerResult = { ok: true; id: string } | { ok: false; error: string; existingId?: string };

const customerSchema = z.object({
  type: z.enum(["PERSON", "COMPANY"]),
  name: z.string().min(1, { error: "Укажите имя или название" }),
  phone: z.string().optional(),
  email: z.string().optional(),
  inn: z.string().optional(),
  kpp: z.string().optional(),
  comment: z.string().optional(),
});

async function run(action: () => Promise<unknown>, message: string, customerId?: string): Promise<CustomerResult> {
  try {
    await action();
    revalidatePath("/customers");
    if (customerId) revalidatePath(`/customers/${customerId}`);
    return { ok: true, message };
  } catch (error) {
    if (error instanceof ForbiddenError || error instanceof Error) {
      return { ok: false, error: error.message };
    }
    throw error;
  }
}

export async function updateCustomerAction(id: string, input: z.input<typeof customerSchema>): Promise<CustomerResult> {
  const user = await requireUser();
  const parsed = customerSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: z.prettifyError(parsed.error) };

  return run(() => updateCustomer(id, parsed.data, user), "Клиент сохранён", id);
}

/**
 * Заведение клиента из списка (PRD, M2.4). При совпадении телефона или email
 * отдаём id найденного — форма предложит открыть его вместо создания дубля.
 */
export async function createCustomerAction(input: z.input<typeof customerSchema>): Promise<CreateCustomerResult> {
  const user = await requireUser();
  const parsed = customerSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: z.prettifyError(parsed.error) };

  try {
    const customer = await createCustomer(parsed.data, user);
    revalidatePath("/customers");
    return { ok: true, id: customer.id };
  } catch (error) {
    if (error instanceof CustomerExistsError) {
      return { ok: false, error: error.message, existingId: error.customerId };
    }
    if (error instanceof ForbiddenError || error instanceof Error) {
      return { ok: false, error: error.message };
    }
    throw error;
  }
}

export async function addAddressAction(
  customerId: string,
  city: string,
  address: string,
  isDefault: boolean,
): Promise<CustomerResult> {
  const user = await requireUser();
  if (!address.trim()) return { ok: false, error: "Адрес не может быть пустым" };

  return run(() => addCustomerAddress(customerId, { city, address, isDefault }, user), "Адрес добавлен", customerId);
}

export async function deleteAddressAction(customerId: string, addressId: string): Promise<CustomerResult> {
  const user = await requireUser();
  return run(() => deleteCustomerAddress(addressId, user), "Адрес удалён", customerId);
}

export async function mergeCustomersAction(targetId: string, duplicateId: string): Promise<CustomerResult> {
  const user = await requireUser();
  return run(() => mergeCustomers(targetId, duplicateId, user), "Клиенты объединены", targetId);
}

/** Поиск возможного дубля для слияния. */
export async function findDuplicatesAction(query: string): Promise<CustomerMatch[]> {
  await requireUser();
  return lookupCustomers(query);
}
