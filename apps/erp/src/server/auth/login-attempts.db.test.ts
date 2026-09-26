import { hashPassword } from "better-auth/crypto";
import { beforeEach, expect, it } from "vitest";
import { FAILED_LOGIN_LIMIT, FAILED_LOGIN_WINDOW_MINUTES } from "@buscom/domain/auth/login-throttle";
import { signInWithPassword } from "@/server/auth-service";
import { loginThrottleState, recordFailedLogin } from "@/server/auth/login-attempts";
import { describeDb, resetDb, testDb } from "@/test/db";

const EMAIL = "manager@test.local";
const PASSWORD = "verniy-parol-42";
const MINUTE_MS = 60_000;

async function makeEmployee(email = EMAIL): Promise<void> {
  const user = await testDb.user.create({
    data: { name: "Тестовый сотрудник", email, role: "MANAGER", emailVerified: true },
  });
  await testDb.account.create({
    data: {
      userId: user.id,
      providerId: "credential",
      accountId: user.id,
      password: await hashPassword(PASSWORD),
    },
  });
}

function signIn(password: string, email = EMAIL) {
  return signInWithPassword({
    email,
    password,
    headers: new Headers({ "x-forwarded-for": "203.0.113.10, 10.0.0.1" }),
  });
}

/** Неудачные попытки без прогона пароля — когда важен только счётчик. */
async function seedFailures(count: number, minutesAgo = 1): Promise<void> {
  await testDb.failedLogin.createMany({
    data: Array.from({ length: count }, () => ({
      email: EMAIL,
      createdAt: new Date(Date.now() - minutesAgo * MINUTE_MS),
    })),
  });
}

describeDb("блокировка входа после неудачных попыток (живая БД)", () => {
  beforeEach(async () => {
    await resetDb();
    await makeEmployee();
  });

  it("девять неудач вход не закрывают", async () => {
    for (let attempt = 0; attempt < FAILED_LOGIN_LIMIT - 1; attempt += 1) {
      const result = await signIn("ne-tot-parol");
      expect(result).toEqual({ ok: false, message: "Неверный email или пароль" });
    }

    expect(await testDb.failedLogin.count({ where: { email: EMAIL } })).toBe(FAILED_LOGIN_LIMIT - 1);
    expect(await loginThrottleState(EMAIL)).toEqual({ blocked: false, attemptsLeft: 1 });
  });

  it("десятая неудача закрывает вход, и верный пароль уже не помогает", async () => {
    await seedFailures(FAILED_LOGIN_LIMIT - 1);

    const tenth = await signIn("ne-tot-parol");
    expect(tenth).toMatchObject({ ok: false });
    expect(tenth.ok === false && tenth.message).toMatch(/Слишком много неудачных попыток/);

    const withRightPassword = await signIn(PASSWORD);
    expect(withRightPassword.ok).toBe(false);
    expect(withRightPassword.ok === false && withRightPassword.message).toMatch(/Слишком много неудачных попыток/);

    // Пока вход закрыт, попытки не пишутся — иначе перебор продлевал бы блокировку.
    expect(await testDb.failedLogin.count({ where: { email: EMAIL } })).toBe(FAILED_LOGIN_LIMIT);
  });

  it("успешный вход обнуляет счётчик", async () => {
    await seedFailures(FAILED_LOGIN_LIMIT - 1);

    const result = await signIn(PASSWORD);

    expect(result).toEqual({ ok: true });
    expect(await testDb.failedLogin.count({ where: { email: EMAIL } })).toBe(0);
  });

  it("блокировка у каждого email своя", async () => {
    await seedFailures(FAILED_LOGIN_LIMIT);

    expect((await loginThrottleState(EMAIL)).blocked).toBe(true);
    expect((await loginThrottleState("someone-else@test.local")).blocked).toBe(false);
  });

  it("неудачи старше окна вход не закрывают", async () => {
    await seedFailures(FAILED_LOGIN_LIMIT, FAILED_LOGIN_WINDOW_MINUTES + 1);

    expect(await loginThrottleState(EMAIL)).toEqual({ blocked: false, attemptsLeft: FAILED_LOGIN_LIMIT });
  });

  it("новая неудача записывает адрес и чистит устаревшие строки", async () => {
    await seedFailures(3, FAILED_LOGIN_WINDOW_MINUTES + 5);
    await recordFailedLogin(EMAIL, "203.0.113.10");

    const rows = await testDb.failedLogin.findMany({ where: { email: EMAIL } });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.ipAddress).toBe("203.0.113.10");
  });

  it("адрес берётся из первого значения X-Forwarded-For", async () => {
    await signIn("ne-tot-parol");

    const row = await testDb.failedLogin.findFirstOrThrow({ where: { email: EMAIL } });
    expect(row.ipAddress).toBe("203.0.113.10");
  });

  it("неизвестный email считается так же — перебор не отличить от опечатки", async () => {
    const unknown = "nikogo@test.local";
    const result = await signIn("ne-tot-parol", unknown);

    expect(result).toEqual({ ok: false, message: "Неверный email или пароль" });
    expect(await testDb.failedLogin.count({ where: { email: unknown } })).toBe(1);
  });
});
