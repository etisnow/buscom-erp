import "server-only";
import { parseLegacyCustomer, type LegacyCustomer } from "@/domain/customer/legacy-import";
import { hasCustomerRequisites } from "@/domain/customer/requisites";
import { Prisma } from "@buscom/db/client";
import { db } from "@/server/db";

/**
 * Импорт клиентской базы из прежней ERP (docs/STATUS.md, «Выгрузка клиентов»).
 *
 * Идемпотентность держится на ключе строки: телефон, иначе ИНН. У 315 строк нет
 * ни того, ни другого — их повторный прогон задвоит, поэтому они считаются
 * отдельно, и скрипт про это говорит.
 *
 * Уже заведённого клиента не перетираем: дозаполняем только пустые поля.
 * Данные, введённые человеком в ERP, всегда свежее выгрузки.
 */

export type ImportReport = {
  всего: number;
  создано: number;
  дополнено: number;
  безИзменений: number;
  безИмени: number;
  безКлюча: number;
  слитоВнутриФайла: number;
};

const EMPTY_REPORT: ImportReport = {
  всего: 0,
  создано: 0,
  дополнено: 0,
  безИзменений: 0,
  безИмени: 0,
  безКлюча: 0,
  слитоВнутриФайла: 0,
};

/** Клиента ищем тем же ключом, каким его пометил разбор строки. */
async function findByKey(key: string): Promise<{ id: string } | null> {
  if (key.startsWith("inn:")) {
    return db.customer.findFirst({ where: { inn: key.slice(4) }, select: { id: true } });
  }
  return db.customer.findUnique({ where: { phone: key }, select: { id: true } });
}

/** Заполняем только то, чего у клиента нет: правка руками важнее выгрузки. */
function fillGaps(
  current: { [K in "email" | "inn" | "kpp" | "contactPerson" | "passport" | "comment"]: string | null } & {
    requisites: Prisma.JsonValue;
  },
  draft: LegacyCustomer,
): Prisma.CustomerUpdateInput {
  const update: Prisma.CustomerUpdateInput = {};

  if (!current.email && draft.email) update.email = draft.email;
  if (!current.inn && draft.inn) update.inn = draft.inn;
  if (!current.kpp && draft.kpp) update.kpp = draft.kpp;
  if (!current.contactPerson && draft.contactPerson) update.contactPerson = draft.contactPerson;
  if (!current.passport && draft.passport) update.passport = draft.passport;
  if (!current.requisites && hasCustomerRequisites(draft.requisites)) update.requisites = draft.requisites;
  // Комментарий не заменяем, а дописываем: там заметки менеджера.
  if (draft.comment && !(current.comment ?? "").includes(draft.comment)) {
    update.comment = current.comment ? `${current.comment}\n${draft.comment}` : draft.comment;
  }

  return update;
}

export type ImportOptions = {
  /** Ничего не писать — только посчитать, что получится. */
  dryRun?: boolean;
  /** Пропускать строки без телефона и ИНН: их повторный прогон задвоит. */
  onlyKeyed?: boolean;
  /** Куда сообщать о ходе: скрипт печатает в консоль, тесты молчат. */
  onProgress?: (done: number, total: number) => void;
};

export async function importLegacyCustomers(
  rows: Record<string, string>[],
  options: ImportOptions = {},
): Promise<ImportReport> {
  const report = { ...EMPTY_REPORT, всего: rows.length };
  // Ключи, уже встреченные в этом же файле: вторая строка с тем же телефоном
  // не создаёт клиента, а дозаполняет первого.
  const seen = new Set<string>();

  for (const [index, row] of rows.entries()) {
    const draft = parseLegacyCustomer(row);

    if (!draft.name) {
      report.безИмени += 1;
      continue;
    }
    if (!draft.key) {
      report.безКлюча += 1;
      if (options.onlyKeyed) continue;
    }
    const duplicateInFile = draft.key ? seen.has(draft.key) : false;
    if (duplicateInFile) report.слитоВнутриФайла += 1;
    if (draft.key) seen.add(draft.key);

    // В холостом прогоне первая строка ключа в базу не попала, поэтому вторую
    // база бы «не нашла» и мы насчитали бы лишние создания. Считаем как дополнение —
    // именно им она и станет при настоящем прогоне.
    if (options.dryRun && duplicateInFile) {
      report.дополнено += 1;
      continue;
    }

    const existing = draft.key ? await findByKey(draft.key) : null;

    if (!existing) {
      report.создано += 1;
      if (!options.dryRun) {
        await db.customer.create({
          data: {
            type: draft.type,
            name: draft.name,
            phone: draft.phone,
            email: draft.email,
            inn: draft.inn,
            kpp: draft.kpp,
            contactPerson: draft.contactPerson,
            passport: draft.passport,
            requisites: hasCustomerRequisites(draft.requisites) ? draft.requisites : Prisma.DbNull,
            comment: draft.comment,
            addresses: draft.address ? { create: [{ address: draft.address, isDefault: true }] } : undefined,
          },
        });
      }
    } else {
      const current = await db.customer.findUniqueOrThrow({
        where: { id: existing.id },
        select: {
          email: true,
          inn: true,
          kpp: true,
          contactPerson: true,
          passport: true,
          requisites: true,
          comment: true,
        },
      });
      const update = fillGaps(current, draft);

      if (Object.keys(update).length === 0) {
        report.безИзменений += 1;
      } else {
        report.дополнено += 1;
        if (!options.dryRun) await db.customer.update({ where: { id: existing.id }, data: update });
      }

      // Адрес добавляем, только если такого у клиента ещё нет.
      if (draft.address && !options.dryRun) {
        const known = await db.customerAddress.findFirst({
          where: { customerId: existing.id, address: draft.address },
          select: { id: true },
        });
        if (!known) {
          const hasDefault = await db.customerAddress.findFirst({
            where: { customerId: existing.id, isDefault: true },
            select: { id: true },
          });
          await db.customerAddress.create({
            data: { customerId: existing.id, address: draft.address, isDefault: !hasDefault },
          });
        }
      }
    }

    options.onProgress?.(index + 1, rows.length);
  }

  return report;
}
