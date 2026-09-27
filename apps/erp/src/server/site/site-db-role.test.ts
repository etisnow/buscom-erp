import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Сайт ходит в базу ролью только на чтение (scripts/site-db-role.sql). Новая
 * таблица, которую сайт начал читать, без права на неё уронит страницу в бою
 * «permission denied» — ловим это здесь. Вложенные выборки (опции товара и их
 * варианты) по коду не видны — они в скрипте перечислены руками.
 */
const ROOT = join(__dirname, "../../../../..");

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : /\.tsx?$/.test(name) ? [path] : [];
  });
}

describe("роль базы сайта", () => {
  it("каждая модель, которую читает сайт, есть в scripts/site-db-role.sql", () => {
    const models = new Set(
      files(join(ROOT, "apps/site/src")).flatMap((path) =>
        [...readFileSync(path, "utf8").matchAll(/\bdb\.([a-z][A-Za-z]+)\./g)].map((match) => match[1]),
      ),
    );
    const sql = readFileSync(join(ROOT, "scripts/site-db-role.sql"), "utf8");
    const granted = new Set([...sql.matchAll(/^\s+"([A-Za-z]+)",?$/gm)].map((match) => match[1]));

    expect(models.size).toBeGreaterThan(0);
    const missing = [...models].map((model) => model[0].toUpperCase() + model.slice(1)).filter((t) => !granted.has(t));
    expect(missing).toEqual([]);
  });

  it("никаких прав на запись", () => {
    const sql = readFileSync(join(ROOT, "scripts/site-db-role.sql"), "utf8");
    expect(sql).not.toMatch(/GRANT\s+(ALL|INSERT|UPDATE|DELETE)/i);
  });
});
