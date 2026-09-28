import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, expect, it, vi } from "vitest";
import { DEFAULT_CARRIER_SETTINGS } from "@buscom/domain/settings";
import { db } from "@/server/db";
import { syncTerminals } from "@/server/carriers/terminals";
import { saveCarrierSettings } from "@/server/settings/service";
import { describeDb, resetDb } from "@/test/db";

/** Выдержка из настоящего справочника ДЛ: 6 пунктов в Нижнем Новгороде и Москве */
const FIXTURE = JSON.parse(
  readFileSync(join(__dirname, "../../../../../packages/domain/src/carrier/fixtures/dellin-terminals.json"), "utf8"),
) as { city: { terminals: { terminal: { id: string }[] } }[] };

let file: unknown = FIXTURE;

vi.mock("@/server/carriers/dellin", () => ({ downloadDellinTerminals: async () => file }));

/** Филиал ПЭК по образцу документации: основное отделение, ПВЗ, отделение только на приём */
const PEC_FIXTURE = JSON.parse(
  readFileSync(join(__dirname, "../../../../../packages/domain/src/carrier/fixtures/pec-branches.json"), "utf8"),
) as unknown;

vi.mock("@/server/carriers/pec", () => ({ downloadPecBranches: async () => PEC_FIXTURE }));

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
    await saveCarrierSettings({ ...DEFAULT_CARRIER_SETTINGS, dellinAppKey: "ключ" }, "test");
  });

  it("без ключа ничего не загружает", async () => {
    await saveCarrierSettings(DEFAULT_CARRIER_SETTINGS, "test");
    expect(await syncTerminals("DELLIN")).toBeNull();
    expect(await db.carrierTerminal.count()).toBe(0);
  });

  it("загружает пункты, повторное обновление не плодит записи", async () => {
    expect(await syncTerminals("DELLIN")).toEqual({ total: 6, skipped: 0, deactivated: 0, suspicious: false });
    await syncTerminals("DELLIN");
    expect(await db.carrierTerminal.count()).toBe(6);
    expect(
      await db.carrierTerminal.findUnique({ where: { carrier_externalId: { carrier: "DELLIN", externalId: "296" } } }),
    ).toMatchObject({ cityName: "Нижний Новгород", address: "Московское ш., 52", givesOutCargo: true, isActive: true });
  });

  it("пропавший пункт гасится, вернувшийся — снова действует", async () => {
    await syncTerminals("DELLIN");
    file = without("667");
    expect((await syncTerminals("DELLIN"))?.deactivated).toBe(1);
    expect(await db.carrierTerminal.findMany({ where: { isActive: false }, select: { externalId: true } })).toEqual([
      { externalId: "667" },
    ]);

    file = FIXTURE;
    await syncTerminals("DELLIN");
    expect(await db.carrierTerminal.count({ where: { isActive: true } })).toBe(6);
  });

  it("выгрузка резко меньше прежней — пропавшие не гасятся", async () => {
    await syncTerminals("DELLIN");
    file = without("296", "667", "764");
    expect(await syncTerminals("DELLIN")).toMatchObject({ total: 3, deactivated: 0, suspicious: true });
    expect(await db.carrierTerminal.count({ where: { isActive: true } })).toBe(6);
  });

  it("ПЭК обновляется своим доступом и не гасит пункты ДЛ", async () => {
    expect(await syncTerminals("PEC")).toBeNull();
    await syncTerminals("DELLIN");
    await saveCarrierSettings({ ...DEFAULT_CARRIER_SETTINGS, pecLogin: "buscom", pecApiKey: "ключ" }, "test");

    expect(await syncTerminals("PEC")).toMatchObject({ total: 3, deactivated: 0 });
    expect(await db.carrierTerminal.count({ where: { carrier: "DELLIN", isActive: true } })).toBe(6);
    expect(
      await db.carrierTerminal.findMany({
        where: { carrier: "PEC" },
        orderBy: { name: "asc" },
        select: { name: true, isPickupPoint: true, givesOutCargo: true },
      }),
    ).toEqual([
      { name: "Армавир", isPickupPoint: false, givesOutCargo: true },
      { name: "Армавир ПВЗ Ленина", isPickupPoint: true, givesOutCargo: true },
      { name: "Армавир Приём", isPickupPoint: false, givesOutCargo: false },
    ]);
  });
});
