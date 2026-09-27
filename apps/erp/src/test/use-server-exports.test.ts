import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Из файла `"use server"` Next разрешает экспортировать только async-функции: любой
 * другой экспорт (схема Zod, константа) роняет каждое действие этого файла ошибкой
 * «A "use server" file can only export async functions» — только при вызове, не при
 * сборке и не в тестах. Так 27.09 сломалось сохранение товаров (экспорт siteSeoSchema).
 */
const ROOT = join(__dirname, "../../../..");

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : /\.tsx?$/.test(name) ? [path] : [];
  });
}

describe('файлы "use server"', () => {
  it("экспортируют только async-функции и типы", () => {
    const offenders = ["apps/erp/src", "apps/site/src"]
      .flatMap((dir) => files(join(ROOT, dir)))
      .filter((path) => /^["']use server["']/m.test(readFileSync(path, "utf8").trimStart().split("\n")[0]))
      .flatMap((path) =>
        [...readFileSync(path, "utf8").matchAll(/^export\s+(?!async function|type |interface )(\S+\s+\S+)/gm)].map(
          (match) => `${path.slice(ROOT.length + 1)}: export ${match[1]}`,
        ),
      );
    expect(offenders).toEqual([]);
  });
});
