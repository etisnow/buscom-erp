import { beforeEach, expect, it } from "vitest";
import { ForbiddenError } from "@/server/errors";
import { createNews, deleteNews, listNews, markNewsRead, unreadNewsCount, updateNews } from "@/server/news/service";
import type { SessionUser } from "@/server/session";
import { describeDb, resetDb } from "@/test/db";
import { makeUser } from "@/test/fixtures";

describeDb("новости платформы (живая БД)", () => {
  let admin: SessionUser;
  let manager: SessionUser;

  beforeEach(async () => {
    await resetDb();
    admin = await makeUser("ADMIN", "Администратор");
    manager = await makeUser("MANAGER", "Менеджер");
  });

  it("пишет только администратор", async () => {
    await expect(createNews({ title: "Заголовок", body: "Текст" }, manager)).rejects.toThrow(ForbiddenError);
    await createNews({ title: "Заголовок", body: "Текст" }, admin);
    const [post] = (await listNews(manager)).posts;
    await expect(updateNews(post.id, { title: "Другой", body: "Текст" }, manager)).rejects.toThrow(ForbiddenError);
    await expect(deleteNews(post.id, manager)).rejects.toThrow(ForbiddenError);
  });

  it("новая запись для других непрочитана, для автора — прочитана; открытие ленты отмечает прочитанным", async () => {
    await createNews({ title: "Чат", body: "Реакции" }, admin);

    expect(await unreadNewsCount(admin.id)).toBe(0);
    expect(await unreadNewsCount(manager.id)).toBe(1);
    expect((await listNews(manager)).posts[0].read).toBe(false);

    expect(await markNewsRead(manager)).toBe(1);
    expect(await markNewsRead(manager)).toBe(0);
    expect(await unreadNewsCount(manager.id)).toBe(0);
    expect((await listNews(manager)).posts[0].read).toBe(true);
  });

  it("администратор видит, кто прочитал, остальным список не отдаётся; правка отметки не сбрасывает", async () => {
    await createNews({ title: "Чат", body: "Реакции" }, admin);
    await markNewsRead(manager);

    const forAdmin = await listNews(admin);
    expect(forAdmin.posts[0].readers?.sort()).toEqual(["Администратор", "Менеджер"]);
    expect(forAdmin.audience).toBe(2);
    expect((await listNews(manager)).posts[0].readers).toBeNull();

    await updateNews(forAdmin.posts[0].id, { title: "Чат и реакции", body: "Реакции" }, admin);
    expect(await unreadNewsCount(manager.id)).toBe(0);
  });
});
