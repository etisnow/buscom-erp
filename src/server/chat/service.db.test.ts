import { beforeEach, expect, it } from "vitest";
import {
  chatChangesSince,
  deleteChatMessage,
  editChatMessage,
  listChatMessages,
  markChatRead,
  postChatMessage,
  purgeExpiredChatAttachments,
  readChatAttachment,
  unreadChatCount,
} from "@/server/chat/service";
import { ForbiddenError } from "@/server/errors";
import { createOrder } from "@/server/orders/create";
import type { SessionUser } from "@/server/session";
import { describeDb, resetDb, testDb } from "@/test/db";
import { makeProduct, makeUser } from "@/test/fixtures";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const TEXT_FILE = new Uint8Array(new TextEncoder().encode("просто текст"));

describeDb("чат сотрудников (живая БД)", () => {
  let author: SessionUser;
  let reader: SessionUser;
  let admin: SessionUser;

  beforeEach(async () => {
    await resetDb();
    author = await makeUser("MANAGER", "Автор");
    reader = await makeUser("HEAD", "Читатель");
    admin = await makeUser("ADMIN", "Администратор");
  });

  it("сообщение с файлами: тип по содержимому, файл читается", async () => {
    const message = await postChatMessage(author, "  смотри  ", [
      { fileName: "фото.png", data: PNG },
      { fileName: "заметка.txt", data: TEXT_FILE },
    ]);
    expect(message.text).toBe("смотри");
    expect(message.author.name).toBe("Автор");
    expect(message.attachments.map((file) => file.contentType)).toEqual(["image/png", "application/octet-stream"]);

    const file = await readChatAttachment(message.attachments[0].id);
    expect(file?.fileName).toBe("фото.png");
    expect([...(file?.data ?? [])]).toEqual([...PNG]);
  });

  it("ссылками становятся только номера существующих заказов", async () => {
    const product = await makeProduct();
    const order = await createOrder({
      source: "PHONE",
      customer: { name: "Иванов Иван", phone: "8 916 123-45-67" },
      items: [{ productId: product.id, sku: product.sku, name: product.name, priceKopecks: 100, quantity: 1 }],
      user: author,
    });
    const message = await postChatMessage(author, `по №${order.number} и #999999`, []);
    expect(message.orderNumbers).toEqual([order.number]);
  });

  it("исправить можно только своё, удалить — своё или администратору", async () => {
    const message = await postChatMessage(author, "черновик", [{ fileName: "a.png", data: PNG }]);

    await expect(editChatMessage(message.id, "чужая правка", reader)).rejects.toThrow(ForbiddenError);
    await editChatMessage(message.id, "исправлено", author);
    let [view] = (await listChatMessages()).messages;
    expect(view.text).toBe("исправлено");
    expect(view.editedAt).not.toBeNull();

    await expect(deleteChatMessage(message.id, reader)).rejects.toThrow(ForbiddenError);
    await deleteChatMessage(message.id, admin);
    [view] = (await listChatMessages()).messages;
    expect(view).toMatchObject({ deleted: true, text: "", attachments: [] });
    expect(await testDb.chatAttachment.count()).toBe(0);
    await expect(editChatMessage(message.id, "после удаления", author)).rejects.toThrow(ForbiddenError);
  });

  it("опрос видит новые, исправленные и удалённые после курсора", async () => {
    const first = await postChatMessage(author, "первое", []);
    const cursor = new Date(Date.now() + 60_000);
    // Двигаем время сообщения в прошлое за пределы запаса опроса
    await testDb.chatMessage.update({
      where: { id: first.id },
      data: { createdAt: new Date(0), updatedAt: new Date(0) },
    });
    expect(await chatChangesSince(cursor)).toEqual([]);

    await editChatMessage(first.id, "поправил", author);
    const changes = await chatChangesSince(new Date());
    expect(changes.map((message) => message.text)).toEqual(["поправил"]);
  });

  it("непрочитанные — чужие сообщения после отметки", async () => {
    await postChatMessage(author, "раз", []);
    const second = await postChatMessage(author, "два", []);
    await postChatMessage(reader, "своё не считается", []);
    // Своё сообщение двигает отметку: всё до него прочитано
    expect(await unreadChatCount(reader.id)).toBe(0);

    await postChatMessage(author, "три", []);
    expect(await unreadChatCount(reader.id)).toBe(1);
    // У автора отметка — на его «три», сообщение читателя было раньше
    expect(await unreadChatCount(author.id)).toBe(0);

    // Отметка назад не двигается
    await markChatRead(reader, new Date(second.createdAt));
    expect(await unreadChatCount(reader.id)).toBe(1);
    await markChatRead(reader, new Date());
    expect(await unreadChatCount(reader.id)).toBe(0);
  });

  it("история листается страницами назад", async () => {
    for (let i = 0; i < 52; i++) await postChatMessage(author, `сообщение ${i}`, []);
    const latest = await listChatMessages();
    expect(latest.hasMore).toBe(true);
    expect(latest.messages).toHaveLength(50);
    expect(latest.messages.at(-1)?.text).toBe("сообщение 51");

    const older = await listChatMessages(latest.messages[0].id);
    expect(older.hasMore).toBe(false);
    expect(older.messages.map((message) => message.text)).toEqual(["сообщение 0", "сообщение 1"]);
  });

  it("файлы старше года стираются, отметка о них остаётся", async () => {
    const message = await postChatMessage(author, "", [{ fileName: "старое.png", data: PNG }]);
    const [file] = message.attachments;
    await testDb.chatAttachment.update({ where: { id: file.id }, data: { createdAt: new Date("2025-01-01") } });

    expect(await purgeExpiredChatAttachments(new Date("2026-09-25"))).toBe(1);
    expect(await readChatAttachment(file.id)).toBeNull();
    const [view] = (await listChatMessages()).messages;
    expect(view.attachments).toMatchObject([{ fileName: "старое.png", expired: true }]);
    expect(await purgeExpiredChatAttachments(new Date("2026-09-25"))).toBe(0);
  });
});
