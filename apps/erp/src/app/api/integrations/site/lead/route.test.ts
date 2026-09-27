import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { signPayload } from "@/server/integrations/signature";

const SECRET = "test-secret-test-secret-test-secret";
const sendLetter = vi.fn();
const mailConfigured = vi.fn();

vi.mock("@/server/env", () => ({ env: { SITE_WEBHOOK_SECRET: SECRET } }));
vi.mock("@/server/mail", () => ({
  sendLetter: (letter: unknown) => sendLetter(letter),
  mailConfigured: () => mailConfigured(),
}));

const { POST } = await import("./route");

const lead = (requestId: string) => ({
  requestId,
  kind: "callback",
  name: "Иван",
  phone: "+79123456789",
  consent: true,
});

async function call(body: unknown, secret = SECRET) {
  const raw = JSON.stringify(body);
  const response = await POST(
    new NextRequest("http://erp/api/integrations/site/lead", {
      method: "POST",
      body: raw,
      headers: { "x-signature": signPayload(raw, secret) },
    }),
  );
  return { status: response.status, json: await response.json().catch(() => null) };
}

describe("заявка с сайта", () => {
  beforeEach(() => {
    sendLetter.mockReset().mockResolvedValue(undefined);
    mailConfigured.mockReset().mockResolvedValue(true);
  });

  it("чужая подпись — 401, письма нет", async () => {
    const { status } = await call(
      { lead: lead(crypto.randomUUID()), page: "https://bus-com.ru/" },
      "other-secret-other",
    );
    expect(status).toBe(401);
    expect(sendLetter).not.toHaveBeenCalled();
  });

  it("заявка — письмо на почту компании с телефоном в теме", async () => {
    const { status } = await call({ lead: lead(crypto.randomUUID()), page: "https://bus-com.ru/kontakty" });
    expect(status).toBe(200);
    expect(sendLetter).toHaveBeenCalledWith(
      expect.objectContaining({ to: "info@bus-com.ru", subject: expect.stringContaining("+7 912 345-67-89") }),
    );
  });

  it("повтор той же формы — второго письма нет", async () => {
    const id = crypto.randomUUID();
    await call({ lead: lead(id), page: "https://bus-com.ru/" });
    const { json } = await call({ lead: lead(id), page: "https://bus-com.ru/" });
    expect(json).toEqual({ ok: true, duplicate: true });
    expect(sendLetter).toHaveBeenCalledTimes(1);
  });

  it("невалидная заявка — 400", async () => {
    expect(
      (await call({ lead: { ...lead(crypto.randomUUID()), phone: "12" }, page: "https://bus-com.ru/" })).status,
    ).toBe(400);
  });

  it("почта не настроена — 503; сбой отправки — 502, и повтор потом пройдёт", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const id = crypto.randomUUID();
    mailConfigured.mockResolvedValue(false);
    expect((await call({ lead: lead(id), page: "https://bus-com.ru/" })).status).toBe(503);

    mailConfigured.mockResolvedValue(true);
    sendLetter.mockRejectedValueOnce(new Error("SMTP"));
    expect((await call({ lead: lead(id), page: "https://bus-com.ru/" })).status).toBe(502);
    expect((await call({ lead: lead(id), page: "https://bus-com.ru/" })).status).toBe(200);
    log.mockRestore();
  });
});
