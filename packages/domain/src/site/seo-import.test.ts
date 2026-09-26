import { describe, expect, it } from "vitest";
import type { OldPage } from "./old-site";
import { planSiteSeo, slugFromCanonical, type ErpCategory, type ErpProduct, type OldSnapshotRow } from "./seo-import";
import { isValidSlug, slugify, uniqueSlug } from "./slug";

const SITE = "https://bus-com.ru";

function row(path: string, page: Partial<OldPage>): OldSnapshotRow {
  return {
    path,
    url: `${SITE}${path}`,
    source: "sitemap",
    priority: null,
    status: 200,
    location: null,
    page: {
      kind: "other",
      opencartId: null,
      title: null,
      description: null,
      keywords: null,
      canonical: null,
      robots: null,
      h1: null,
      breadcrumbs: [],
      contentHtml: null,
      contentText: null,
      ...page,
    },
  };
}

const product = (id: string, externalId: string, name: string, extra: Partial<ErpProduct> = {}): ErpProduct => ({
  id,
  externalId,
  name,
  slug: null,
  metaTitle: null,
  metaDescription: null,
  ...extra,
});

const category = (id: string, name: string, parentName: string | null): ErpCategory => ({
  id,
  name,
  parentName,
  slug: null,
  metaTitle: null,
  metaDescription: null,
});

describe("слуг", () => {
  it("транслитерация в стиле старого сайта, без знаков и повторных дефисов", () => {
    expect(slugify("Багажник на задние двери (рюкзак) на Ford Transit")).toBe(
      "bagazhnik-na-zadnie-dveri-ryukzak-na-ford-transit",
    );
    expect(slugify("Подлокотник туристический — Россия")).toBe("podlokotnik-turisticheskij-rossiya");
    expect(slugify("«»")).toBe("tovar");
    const long = slugify(
      "Электропривод сдвижной двери двухмоторный Mercedes Sprinter, Volkswagen Crafter, ГАЗель NEXT, Iveco Daily",
    );
    expect(long.length).toBeLessThanOrEqual(80);
    expect(long).toMatch(/^elektroprivod-sdvizhnoj-dveri-.*[a-z]$/);
  });

  it("проверка и свободный слуг", () => {
    expect(isValidSlug("polki")).toBe(true);
    expect(isValidSlug("Polki")).toBe(false);
    expect(isValidSlug("kontakty")).toBe(false);
    expect(isValidSlug("a".repeat(158))).toBe(true);
    expect(uniqueSlug("polki", new Set(["polki", "polki-2"]))).toBe("polki-3");
    expect(uniqueSlug("kontakty", new Set())).toBe("kontakty-2");
  });

  it("из canonical — последний сегмент; index.php — нет", () => {
    expect(slugFromCanonical(`${SITE}/polki`)).toBe("polki");
    expect(slugFromCanonical(`${SITE}/index.php?route=product/product&product_id=470`)).toBeNull();
    expect(slugFromCanonical(null)).toBeNull();
  });
});

describe("план переноса SEO", () => {
  const snapshot: OldSnapshotRow[] = [
    // Товар с ЧПУ под тремя адресами
    ...["/klei", "/russia/klei", "/detali-salona/polki/klei"].map((path) =>
      row(path, {
        kind: "product",
        opencartId: "319",
        canonical: `${SITE}/klei`,
        title: path === "/klei" ? "Клей для ткани купить" : "другой",
        description: "Клей",
        h1: "Клей для ткани 1 кг",
      }),
    ),
    // Товар без ЧПУ
    row("/index.php?route=product/product&product_id=470", {
      kind: "product",
      opencartId: "470",
      canonical: `${SITE}/index.php?route=product/product&product_id=470`,
      title: "Багажник",
      h1: "Багажник на Ford Transit",
    }),
    // Категория: короткий canonical и путь с разделом
    row("/detali-salona", {
      kind: "category",
      opencartId: "80",
      canonical: `${SITE}/detali-salona`,
      h1: "Детали салона",
    }),
    ...["/polki", "/detali-salona/polki"].map((path) =>
      row(path, {
        kind: "category",
        opencartId: path === "/polki" ? "62" : "80_62",
        canonical: `${SITE}/polki`,
        title: "Полки для микроавтобусов.",
        h1: "Полки",
        // По короткому адресу OpenCart крошек не отдаёт
        breadcrumbs: path === "/polki" ? [] : [{ name: "Детали салона", url: `${SITE}/detali-salona` }],
      }),
    ),
    // Категории, которых в ERP нет: с родителем и без
    row("/detali-salona/kovry", {
      kind: "category",
      opencartId: "80_99",
      canonical: `${SITE}/kovry`,
      h1: "Ковры",
      breadcrumbs: [{ name: "Детали салона", url: `${SITE}/detali-salona` }],
    }),
    row("/paz", { kind: "category", opencartId: "79", canonical: `${SITE}/paz`, h1: "ПАЗ" }),
    row("/webasto", { kind: "manufacturer", opencartId: "16" }),
    row("/pereoborudovanie-mikroavtobusa", { kind: "other" }),
    row("/refubrishment_test", { kind: "information" }),
    row("/kontakty", { kind: "information" }),
    row("/", { kind: "home" }),
  ];

  const erp = {
    products: [
      product("p-klei", "319", "Клей для ткани 1 кг"),
      product("p-bag", "470", "Багажник"),
      product("p-bez-saita", "999", "Товар без сайта"),
    ],
    categories: [category("c-salon", "Детали салона", null), category("c-polki", "Полки", "Детали салона")],
  };

  it("слуги и метатеги дословно — со страницы по canonical", () => {
    const plan = planSiteSeo(snapshot, erp);
    expect(plan.products).toEqual([
      { id: "p-klei", slug: "klei", metaTitle: "Клей для ткани купить", metaDescription: "Клей" },
      { id: "p-bag", slug: "bagazhnik-na-ford-transit", metaTitle: "Багажник", metaDescription: null },
    ]);
    expect(plan.generatedSlugs).toEqual([{ externalId: "470", name: "Багажник", slug: "bagazhnik-na-ford-transit" }]);
    expect(plan.categories.map((c) => [c.id, c.slug, c.metaTitle])).toEqual([
      ["c-salon", "detali-salona", null],
      ["c-polki", "polki", "Полки для микроавтобусов."],
    ]);
    expect(plan.problems).toEqual([]);
  });

  it("переадресации: дубли — на товар и категорию, чужие категории — на родителя или главную, мусор — 410", () => {
    const byPath = new Map(planSiteSeo(snapshot, erp).redirects.map((r) => [r.fromPath, r]));
    expect(byPath.get("/russia/klei")).toMatchObject({ productId: "p-klei", statusCode: 301 });
    expect(byPath.get("/detali-salona/polki/klei")).toMatchObject({ productId: "p-klei" });
    expect(byPath.get("/index.php?route=product/product&product_id=470")).toMatchObject({ productId: "p-bag" });
    expect(byPath.get("/detali-salona/polki")).toMatchObject({ categoryId: "c-polki" });
    expect(byPath.get("/detali-salona/kovry")).toMatchObject({ categoryId: "c-salon", toPath: null });
    expect(byPath.get("/paz")).toMatchObject({ categoryId: null, toPath: "/" });
    expect(byPath.get("/webasto")).toMatchObject({ toPath: "/", statusCode: 301 });
    expect(byPath.get("/pereoborudovanie-mikroavtobusa")).toMatchObject({ toPath: "/" });
    expect(byPath.get("/refubrishment_test")).toMatchObject({ toPath: null, statusCode: 410 });
    // Канонические адреса и остающиеся страницы — не переадресации
    for (const path of ["/klei", "/polki", "/detali-salona", "/kontakty", "/"]) expect(byPath.has(path)).toBe(false);
  });

  it("заданное в ERP не перезаписывается: слуг и метатеги", () => {
    const plan = planSiteSeo(snapshot, {
      ...erp,
      products: [product("p-klei", "319", "Клей", { slug: "klei-1kg", metaTitle: "Своё" }), ...erp.products.slice(1)],
    });
    expect(plan.products[0]).toMatchObject({ slug: "klei-1kg", metaTitle: "Своё", metaDescription: "Клей" });
    // Старый канонический адрес теперь тоже переадресация
    expect(plan.redirects.find((r) => r.fromPath === "/klei")).toMatchObject({ productId: "p-klei" });
  });

  it("товар, которого нет в ERP, и ответ не 200 — в проблемах", () => {
    const plan = planSiteSeo(
      [
        ...snapshot,
        { ...row("/net", { kind: "product", opencartId: "1", h1: "Нет" }) },
        { ...row("/x", {}), status: 404, page: null },
      ],
      erp,
    );
    expect(plan.problems).toHaveLength(2);
    expect(plan.redirects.find((r) => r.fromPath === "/net")).toMatchObject({ toPath: "/" });
  });
});

describe("слуг из формы ERP", () => {
  it("регистр, пробелы и слэши по краям не в счёт; пусто — не на сайте", async () => {
    const { parseSlugInput } = await import("./slug");
    expect(parseSlugInput("  /Sidene-Turist/ ")).toEqual({ slug: "sidene-turist" });
    expect(parseSlugInput("")).toEqual({ slug: null });
    expect(parseSlugInput(null)).toEqual({ slug: null });
    expect(parseSlugInput("сиденье")).toMatchObject({ error: expect.stringContaining("латинские") });
    expect(parseSlugInput("kontakty")).toMatchObject({ error: expect.stringContaining("занят") });
  });
});
