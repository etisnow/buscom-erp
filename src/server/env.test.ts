import { describe, expect, it } from "vitest";
import { parseEnv } from "@/server/env";

/**
 * Пустая строка в окружении — это «не задано». Docker Compose именно так
 * передаёт незаполненную переменную (`SMTP_HOST: ${SMTP_HOST:-}`), и на этом
 * приложение падало на старте в бою: `.optional()` допускает `undefined`,
 * но не "". Тест закрывает тот дефект.
 */
const required = {
  DATABASE_URL: "postgresql://user:pass@localhost:5432/db",
  BETTER_AUTH_SECRET: "x".repeat(32),
  BETTER_AUTH_URL: "https://erp.example.com",
  SITE_WEBHOOK_SECRET: "y".repeat(32),
};

describe("parseEnv", () => {
  it("принимает окружение без необязательных переменных", () => {
    const env = parseEnv(required);
    expect(env.SMTP_HOST).toBeUndefined();
    expect(env.SMTP_PORT).toBe(587);
    expect(env.SMTP_SECURE).toBe(false);
  });

  it("считает пустые строки незаданными значениями", () => {
    const env = parseEnv({
      ...required,
      SMTP_HOST: "",
      SMTP_USER: "",
      SMTP_PASSWORD: "",
    });

    expect(env.SMTP_HOST).toBeUndefined();
    expect(env.SMTP_USER).toBeUndefined();
    expect(env.SMTP_PASSWORD).toBeUndefined();
  });

  it("пустые строки не затирают значения по умолчанию", () => {
    const env = parseEnv({ ...required, SMTP_PORT: "", SMTP_SECURE: "", SMTP_FROM: "" });

    expect(env.SMTP_PORT).toBe(587);
    expect(env.SMTP_SECURE).toBe(false);
    expect(env.SMTP_FROM).toBe("BusCom ERP <noreply@bus-com.ru>");
  });

  it("заполненные значения SMTP проходят как есть", () => {
    const env = parseEnv({
      ...required,
      SMTP_HOST: "smtp.example.com",
      SMTP_PORT: "465",
      SMTP_SECURE: "true",
      SMTP_USER: "robot",
    });

    expect(env.SMTP_HOST).toBe("smtp.example.com");
    expect(env.SMTP_PORT).toBe(465);
    expect(env.SMTP_SECURE).toBe(true);
    expect(env.SMTP_USER).toBe("robot");
  });

  it("обязательная переменная с пустым значением считается отсутствующей", () => {
    expect(() => parseEnv({ ...required, DATABASE_URL: "" })).toThrow();
  });
});
