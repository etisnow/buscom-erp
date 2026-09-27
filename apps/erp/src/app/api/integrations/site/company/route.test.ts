import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { signPayload } from "@/server/integrations/signature";

const SECRET = "test-secret-test-secret-test-secret";
const findCompanyByInn = vi.fn();

vi.mock("@/server/env", () => ({ env: { SITE_WEBHOOK_SECRET: SECRET } }));
vi.mock("@/server/customers/company-lookup", () => ({ findCompanyByInn: (inn: string) => findCompanyByInn(inn) }));

const { POST } = await import("./route");

function request(body: string, signature: string | null = signPayload(body, SECRET)) {
  return new NextRequest("http://erp/api/integrations/site/company", {
    method: "POST",
    body,
    headers: signature ? { "x-signature": signature } : {},
  });
}

const call = async (body: unknown) => {
  const response = await POST(request(JSON.stringify(body)));
  return { status: response.status, json: await response.json() };
};

const company = {
  inn: "7707083893",
  name: "ПАО Сбербанк",
  kpp: "773601001",
  legalName: "ПУБЛИЧНОЕ АКЦИОНЕРНОЕ ОБЩЕСТВО «СБЕРБАНК РОССИИ»",
  legalAddress: "г Москва, ул Вавилова, д 19",
  ogrn: "1027700132195",
  signerName: "Президент Греф Герман Оскарович",
  status: "ACTIVE",
};

describe("реквизиты по ИНН для сайта", () => {
  beforeEach(() => findCompanyByInn.mockReset());

  it("без подписи и с чужой подписью — 401, в DaData не ходим", async () => {
    const body = JSON.stringify({ inn: "7707083893" });
    expect((await POST(request(body, null))).status).toBe(401);
    expect((await POST(request(body, signPayload(body, "other-secret-other-secret-other")))).status).toBe(401);
    expect(findCompanyByInn).not.toHaveBeenCalled();
  });

  it("тело не той формы — 400", async () => {
    expect((await call({ inn: 7707083893 })).status).toBe(400);
    expect((await POST(request("не json"))).status).toBe(400);
  });

  it("ИНН с опечаткой — ошибка без похода в DaData", async () => {
    const { json } = await call({ inn: "7707083890" });
    expect(json).toEqual({ ok: false, error: expect.stringContaining("контрольная") });
    expect(findCompanyByInn).not.toHaveBeenCalled();
  });

  it("найдено — сайту только название, КПП и признак действующей", async () => {
    findCompanyByInn.mockResolvedValue({ ok: true, company });
    const { status, json } = await call({ inn: " 7707 083893 " });
    expect(status).toBe(200);
    expect(findCompanyByInn).toHaveBeenCalledWith("7707083893");
    expect(json).toEqual({ ok: true, company: { name: "ПАО Сбербанк", kpp: "773601001", active: true } });
  });

  it("ликвидированная — active: false", async () => {
    findCompanyByInn.mockResolvedValue({ ok: true, company: { ...company, status: "LIQUIDATED" } });
    expect((await call({ inn: "7707083893" })).json.company.active).toBe(false);
  });

  it("не найдено — так и говорим; сбой — общий текст, причина только в лог", async () => {
    findCompanyByInn.mockResolvedValue({ ok: false, error: "Организация с таким ИНН не найдена", notFound: true });
    expect((await call({ inn: "7707083893" })).json.error).toBe("Организация с таким ИНН не найдена");

    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    findCompanyByInn.mockResolvedValue({ ok: false, error: "DaData не приняла ключ API — проверьте DADATA_API_KEY" });
    const { json } = await call({ inn: "7707083893" });
    expect(json.error).not.toContain("DADATA");
    expect(log).toHaveBeenCalledWith(expect.stringContaining("DADATA_API_KEY"));
    log.mockRestore();
  });
});
