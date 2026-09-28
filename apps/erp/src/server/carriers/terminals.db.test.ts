import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, expect, it, vi } from "vitest";
import { db } from "@/server/db";
import { syncDellinTerminals } from "@/server/carriers/terminals";
import { saveCarrierSettings } from "@/server/settings/service";
import { describeDb, resetDb } from "@/test/db";

/** Выдержка из настоящего справочника ДЛ: 6 пунктов в Нижнем Новгороде и Москве */
const FIXTURE = JSON.parse(
  readFileSync(join(__dirname, "../../../../../packages/domain/src/carrier/fixtures/dellin-terminals.json"), "utf8"),
) as { city: { terminals: { terminal: { id: string }[] } }[] };

let file: unknown = FIXTURE;

vi.mock("@/server/carriers/dellin", () => ({ downloadDellinTerminals: async () => file }));

/** Файл без пунктов с указанными кодами */
function without(...ids: string[]) {
  return {
    city: FIXTURE.city.map((city) => ({
      ...city,
      terminals: { terminal: city.terminals.terminal.filter((terminal) => !ids.includes(terminal.id)) },
    })),
  };
}

describeDb("справочник терминалов ДЛ (живая БД)", () => {
  beforeEach(async () => {
    await resetDb();
    file = FIXTURE;
    await saveCarrierSettings({ dellinAppKey: "ключ", yandexMapsApiKey: "" }, "test");
  });

  it("без ключа ничего не загружает", async () => {
    await saveCarrierSettings({ dellinAppKey: "", yandexMapsApiKey: "" }, "test");
    expect(await syncDellinTerminals()).toBeNull();
    expect(await db.carrierTerminal.count()).toBe(0);
  });

  it("загружает пункты, повторное обновление не плодит записи", async () => {
    expect(await syncDellinTerminals()).toEqual({ total: 6, skipped: 0, deactivated: 0, suspicious: false });
    await syncDellinTerminals();
    expect(await db.carrierTerminal.count()).toBe(6);
    expect(
      await db.carrierTerminal.findUnique({ where: { carrier_externalId: { carrier: "DELLIN", externalId: "296" } } }),
    ).toMatchObject({ cityName: "Нижний Новгород", address: "Московское ш., 52", givesOutCargo: true, isActive: true });
  });

  it("пропавший пункт гасится, вернувшийся — снова действует", async () => {
    await syncDellinTerminals();
    file = without("667");
    expect((await syncDellinTerminals())?.deactivated).toBe(1);
    expect(await db.carrierTerminal.findMany({ where: { isActive: false }, select: { externalId: true } })).toEqual([
      { externalId: "667" },
    ]);

    file = FIXTURE;
    await syncDellinTerminals();
    expect(await db.carrierTerminal.count({ where: { isActive: true } })).toBe(6);
  });

  it("выгрузка резко меньше прежней — пропавшие не гасятся", async () => {
    await syncDellinTerminals();
    file = without("296", "667", "764");
    expect(await syncDellinTerminals()).toMatchObject({ total: 3, deactivated: 0, suspicious: true });
    expect(await db.carrierTerminal.count({ where: { isActive: true } })).toBe(6);
  });
});
