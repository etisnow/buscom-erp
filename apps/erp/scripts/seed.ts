/**
 * Наполнение пустой БД: первый администратор из переменных окружения,
 * демо-товары для проверки экранов. Запуск: `pnpm db:seed`.
 * Скрипт идемпотентен — повторный запуск ничего не ломает и не перетирает пароли.
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { hashPassword } from "better-auth/crypto";
import { CANCEL_REASONS } from "@buscom/domain/order/cancel-reasons";
import { z } from "zod";
import { PrismaClient } from "@buscom/db/client";

const seedEnv = z.object({
  DATABASE_URL: z.string().url(),
  SEED_ADMIN_EMAIL: z.email(),
  SEED_ADMIN_NAME: z.string().min(1).default("Администратор"),
  SEED_ADMIN_PASSWORD: z.string().min(8, { error: "Пароль администратора — минимум 8 символов" }),
});

const env = seedEnv.parse(process.env);
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: env.DATABASE_URL }) });

/**
 * Better Auth хранит email в нижнем регистре, пароль — в таблице account провайдера `credential`.
 * Важно: при входе он ищет аккаунт с `accountId === user.id`, поэтому туда идёт
 * id пользователя, а не email (см. better-auth/dist/api/routes/sign-in.mjs).
 */
async function seedAdmin(): Promise<void> {
  const email = env.SEED_ADMIN_EMAIL.toLowerCase();
  const existing = await db.user.findUnique({ where: { email } });

  if (existing) {
    console.log(`· Администратор ${email} уже есть — пропускаем`);
    return;
  }

  const passwordHash = await hashPassword(env.SEED_ADMIN_PASSWORD);

  const user = await db.user.create({
    data: { email, name: env.SEED_ADMIN_NAME, role: "ADMIN", emailVerified: true },
  });

  await db.account.create({
    data: { userId: user.id, providerId: "credential", accountId: user.id, password: passwordHash },
  });

  console.log(`✓ Создан администратор ${email}`);
}

/** Демо-каталог: несколько позиций из ассортимента bus-com.ru, чтобы было что искать в заказе. */
const DEMO_PRODUCTS = [
  {
    sku: "ST-3M-GAZ",
    name: "Сиденье тройное «ГАЗель Next», ткань",
    category: "Сиденья",
    priceKopecks: 2_450_000,
    compatibility: ["ГАЗель Next", "ГАЗель Бизнес"],
  },
  {
    sku: "ST-2M-SPR",
    name: "Сиденье двойное Mercedes Sprinter, экокожа",
    category: "Сиденья",
    priceKopecks: 1_980_000,
    compatibility: ["Mercedes Sprinter"],
  },
  {
    sku: "LK-700",
    name: "Люк вентиляционный 700×700, механический",
    category: "Люки",
    priceKopecks: 890_000,
    compatibility: ["ГАЗель Next", "Ford Transit", "Mercedes Sprinter"],
  },
  {
    sku: "PL-BAG-2M",
    name: "Полка багажная 2 м с подсветкой",
    category: "Полки",
    priceKopecks: 1_340_000,
    compatibility: ["Ford Transit"],
  },
  {
    sku: "PR-NERZH-1500",
    name: "Поручень нержавеющий 1500 мм",
    category: "Поручни",
    priceKopecks: 320_000,
    compatibility: ["ГАЗель Next", "Ford Transit"],
  },
  {
    sku: "SP-ELEK-800",
    name: "Ступень электрическая выдвижная 800 мм",
    category: "Ступени",
    priceKopecks: 5_600_000,
    compatibility: ["Mercedes Sprinter", "Ford Transit"],
  },
];

async function seedProducts(): Promise<void> {
  for (const product of DEMO_PRODUCTS) {
    const { category, ...data } = product;
    // Категория демо-товара — верхнего уровня в справочнике; заводим, если её ещё нет.
    const found = await db.productCategory.findFirst({
      where: { name: category, parentId: null },
      select: { id: true },
    });
    const categoryId =
      found?.id ?? (await db.productCategory.create({ data: { name: category }, select: { id: true } })).id;
    await db.product.upsert({
      where: { sku: product.sku },
      update: {},
      create: { ...data, categoryId, compatibility: [...product.compatibility] },
    });
  }
  console.log(`✓ Демо-товары: ${DEMO_PRODUCTS.length} позиций`);
}

/** Справочники: до первого редактирования администратором работают эти значения. */
async function seedDictionaries(): Promise<void> {
  const cancelReasons = [...CANCEL_REASONS];
  const carriers = ["СДЭК", "Деловые линии", "ПЭК", "Байкал Сервис", "Почта России"];

  await db.dictionaryItem.createMany({
    data: [
      ...cancelReasons.map((name, index) => ({
        type: "CANCEL_REASON" as const,
        name,
        sortOrder: (index + 1) * 10,
      })),
      ...carriers.map((name, index) => ({ type: "CARRIER" as const, name, sortOrder: (index + 1) * 10 })),
    ],
    skipDuplicates: true,
  });

  console.log(`✓ Справочники: причин отмены ${cancelReasons.length}, транспортных компаний ${carriers.length}`);
}

async function main(): Promise<void> {
  await seedAdmin();
  await seedProducts();
  await seedDictionaries();
}

main()
  .catch((error: unknown) => {
    console.error("Сид не выполнен:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
