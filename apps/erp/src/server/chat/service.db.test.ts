import { beforeEach, expect, it } from "vitest";
import {
  chatChangesSince,
  createChatRoom,
  deleteChatRoom,
  deleteChatMessage,
  editChatMessage,
  listChatMessages,
  listChatRooms,
  markChatRead,
  postChatMessage,
  purgeExpiredChatAttachments,
  readChatAttachment,
  renameChatRoom,
  toggleChatReaction,
  unreadChatCount,
} from "@/server/chat/service";
import { ChatError } from "@buscom/domain/chat/message";
import { GENERAL_CHAT_ROOM_ID } from "@buscom/domain/chat/room";
import { ForbiddenError } from "@/server/errors";
import { createOrder } from "@/server/orders/create";
import type { SessionUser } from "@/server/session";
import { describeDb, resetDb, testDb } from "@/test/db";
import { makeProduct, makeUser } from "@/test/fixtures";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const TEXT_FILE = new Uint8Array(new TextEncoder().encode("просто текст"));
/** «Общий чат» заводит миграция, а resetDb его стирает (TRUNCATE user CASCADE) — заводим заново */
const ROOM = GENERAL_CHAT_ROOM_ID;

describeDb("чат сотрудников (живая БД)", () => {
  let author: SessionUser;
  let reader: SessionUser;
  let admin: SessionUser;

  beforeEach(async () => {
    await resetDb();
    author = await makeUser("MANAGER", "Автор");
    reader = await makeUser("HEAD", "Читатель");
    admin = await makeUser("ADMIN", "Администратор");
    await testDb.chatRoom.create({ data: { id: ROOM, name: "Общий чат" } });
  });

  it("сообщение с файлами: тип по содержимому, файл читается", async () => {
    const message = await postChatMessage(author, ROOM, "  смотри  ", [
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
    const message = await postChatMessage(author, ROOM, `по №${order.number} и #999999`, []);
    expect(message.orderNumbers).toEqual([order.number]);
  });

  it("исправить можно только своё, удалить — своё или администратору", async () => {
    const message = await postChatMessage(author, ROOM, "черновик", [{ fileName: "a.png", data: PNG }]);

    await expect(editChatMessage(message.id, "чужая правка", reader)).rejects.toThrow(ForbiddenError);
    await editChatMessage(message.id, "исправлено", author);
    let [view] = (await listChatMessages(ROOM)).messages;
    expect(view.text).toBe("исправлено");
    expect(view.editedAt).not.toBeNull();

    await expect(deleteChatMessage(message.id, reader)).rejects.toThrow(ForbiddenError);
    await deleteChatMessage(message.id, admin);
    [view] = (await listChatMessages(ROOM)).messages;
    expect(view).toMatchObject({ deleted: true, text: "", attachments: [] });
    expect(await testDb.chatAttachment.count()).toBe(0);
    await expect(editChatMessage(message.id, "после удаления", author)).rejects.toThrow(ForbiddenError);
  });

  it("опрос видит новые, исправленные и удалённые после курсора", async () => {
    const first = await postChatMessage(author, ROOM, "первое", []);
    const cursor = new Date(Date.now() + 60_000);
    // Двигаем время сообщения в прошлое за пределы запаса опроса
    await testDb.chatMessage.update({
      where: { id: first.id },
      data: { createdAt: new Date(0), updatedAt: new Date(0) },
    });
    expect(await chatChangesSince(ROOM, cursor)).toEqual([]);

    await editChatMessage(first.id, "поправил", author);
    const changes = await chatChangesSince(ROOM, new Date());
    expect(changes.map((message) => message.text)).toEqual(["поправил"]);
  });

  it("непрочитанные — чужие сообщения после отметки", async () => {
    await postChatMessage(author, ROOM, "раз", []);
    const second = await postChatMessage(author, ROOM, "два", []);
    await postChatMessage(reader, ROOM, "своё не считается", []);
    // Своё сообщение двигает отметку: всё до него прочитано
    expect(await unreadChatCount(reader.id)).toBe(0);

    await postChatMessage(author, ROOM, "три", []);
    expect(await unreadChatCount(reader.id)).toBe(1);
    // У автора отметка — на его «три», сообщение читателя было раньше
    expect(await unreadChatCount(author.id)).toBe(0);

    // Отметка назад не двигается
    await markChatRead(reader, ROOM, new Date(second.createdAt));
    expect(await unreadChatCount(reader.id)).toBe(1);
    await markChatRead(reader, ROOM, new Date());
    expect(await unreadChatCount(reader.id)).toBe(0);
  });

  it("ответ несёт цитату исходного; на удалённое ответить нельзя", async () => {
    const original = await postChatMessage(author, ROOM, "Где накладная по\n#3016?", []);
    const reply = await postChatMessage(reader, ROOM, "Прикрепил", [], original.id);
    expect(reply.replyTo).toEqual({ id: original.id, authorName: "Автор", preview: "Где накладная по #3016?" });

    await deleteChatMessage(original.id, author);
    const [, view] = (await listChatMessages(ROOM)).messages;
    expect(view.replyTo).toEqual({ id: original.id, authorName: "Автор", preview: "Сообщение удалено" });

    await expect(postChatMessage(reader, ROOM, "ещё", [], original.id)).rejects.toThrow("удалено");
    await expect(postChatMessage(reader, ROOM, "ещё", [], "нет-такого")).rejects.toThrow("не найдено");
  });

  it("история листается страницами назад", async () => {
    for (let i = 0; i < 52; i++) await postChatMessage(author, ROOM, `сообщение ${i}`, []);
    const latest = await listChatMessages(ROOM);
    expect(latest.hasMore).toBe(true);
    expect(latest.messages).toHaveLength(50);
    expect(latest.messages.at(-1)?.text).toBe("сообщение 51");

    const older = await listChatMessages(ROOM, latest.messages[0].id);
    expect(older.hasMore).toBe(false);
    expect(older.messages.map((message) => message.text)).toEqual(["сообщение 0", "сообщение 1"]);
  });

  it("файлы старше года стираются, отметка о них остаётся", async () => {
    const message = await postChatMessage(author, ROOM, "", [{ fileName: "старое.png", data: PNG }]);
    const [file] = message.attachments;
    await testDb.chatAttachment.update({ where: { id: file.id }, data: { createdAt: new Date("2025-01-01") } });

    expect(await purgeExpiredChatAttachments(new Date("2026-09-25"))).toBe(1);
    expect(await readChatAttachment(file.id)).toBeNull();
    const [view] = (await listChatMessages(ROOM)).messages;
    expect(view.attachments).toMatchObject([{ fileName: "старое.png", expired: true }]);
    expect(await purgeExpiredChatAttachments(new Date("2026-09-25"))).toBe(0);
  });

  it("реакция ставится и снимается повторным нажатием, опрос видит изменение", async () => {
    const message = await postChatMessage(author, ROOM, "привет", []);
    const before = new Date();

    const put = await toggleChatReaction(message.id, "👍", reader);
    expect(put.reactions).toEqual([{ emoji: "👍", users: [{ id: reader.id, name: "Читатель" }] }]);
    await toggleChatReaction(message.id, "👍", author);
    const both = await toggleChatReaction(message.id, "🔥", author);
    expect(both.reactions.map((reaction) => [reaction.emoji, reaction.users.length])).toEqual([
      ["👍", 2],
      ["🔥", 1],
    ]);
    expect((await chatChangesSince(ROOM, before)).map((item) => item.id)).toContain(message.id);

    const removed = await toggleChatReaction(message.id, "👍", reader);
    expect(removed.reactions.find((reaction) => reaction.emoji === "👍")?.users).toEqual([
      { id: author.id, name: "Автор" },
    ]);
  });

  it("реакцией может быть только эмодзи; на удалённое сообщение реакцию не ставят", async () => {
    const message = await postChatMessage(author, ROOM, "привет", []);
    await expect(toggleChatReaction(message.id, "да", reader)).rejects.toThrow("только эмодзи");

    await deleteChatMessage(message.id, author);
    await expect(toggleChatReaction(message.id, "👍", reader)).rejects.toThrow("удалено");
  });

  it("комнаты: лента и непрочитанные у каждой свои", async () => {
    const { id: stock } = await createChatRoom(author, "  Склад  ");
    await postChatMessage(author, ROOM, "в общий", []);
    await postChatMessage(author, stock, "на склад", []);
    await postChatMessage(author, stock, "ещё на склад", []);

    expect((await listChatMessages(stock)).messages.map((message) => message.text)).toEqual([
      "на склад",
      "ещё на склад",
    ]);
    expect((await chatChangesSince(ROOM, new Date())).map((message) => message.text)).toEqual(["в общий"]);

    const rooms = await listChatRooms(reader.id);
    expect(rooms.map((room) => [room.name, room.unread])).toEqual([
      ["Общий чат", 1],
      ["Склад", 2],
    ]);
    expect(await unreadChatCount(reader.id)).toBe(3);

    await markChatRead(reader, stock, new Date());
    expect(await unreadChatCount(reader.id)).toBe(1);
  });

  it("ответить можно только на сообщение той же комнаты", async () => {
    const { id: stock } = await createChatRoom(author, "Склад");
    const original = await postChatMessage(author, ROOM, "вопрос", []);
    await expect(postChatMessage(reader, stock, "ответ", [], original.id)).rejects.toThrow("не найдено");
  });

  it("комнату переименовывает и удаляет создатель или администратор; «Общий чат» не удаляется", async () => {
    const { id } = await createChatRoom(author, "Склад");
    await expect(renameChatRoom(id, "Чужое", reader)).rejects.toThrow(ForbiddenError);
    await renameChatRoom(id, "Склад и отгрузки", author);
    await expect(createChatRoom(author, "   ")).rejects.toThrow(ChatError);

    await expect(deleteChatRoom(id, reader)).rejects.toThrow(ForbiddenError);
    await postChatMessage(author, id, "до удаления", []);
    await deleteChatRoom(id, admin);
    expect((await listChatRooms(reader.id)).map((room) => room.name)).toEqual(["Общий чат"]);
    // Непрочитанное удалённой комнаты больше не считается, писать в неё нельзя
    expect(await unreadChatCount(reader.id)).toBe(0);
    await expect(postChatMessage(author, id, "после", [])).rejects.toThrow(ChatError);

    await expect(deleteChatRoom(ROOM, admin)).rejects.toThrow(ForbiddenError);
  });
});
