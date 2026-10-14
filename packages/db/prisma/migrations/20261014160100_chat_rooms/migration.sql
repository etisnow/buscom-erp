-- Комнаты чата. Всё, что было в чате до них, переезжает в комнату «Общий чат»
-- (id — GENERAL_CHAT_ROOM_ID из packages/domain/src/chat/room.ts), отметки
-- «прочитано» сотрудников (user.chatReadAt) — в её ChatRoomRead.

-- CreateTable
CREATE TABLE "ChatRoom" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ChatRoom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatRoomRead" (
    "roomId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "readAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatRoomRead_pkey" PRIMARY KEY ("roomId","userId")
);

INSERT INTO "ChatRoom" ("id", "name", "createdAt", "updatedAt")
VALUES ('chat_room_general', 'Общий чат', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

-- Колонка сначала с запасным значением: существующие строки получают «Общий чат»,
-- затем запасное снимается — новые сообщения обязаны называть комнату сами
ALTER TABLE "ChatMessage" ADD COLUMN "roomId" TEXT NOT NULL DEFAULT 'chat_room_general';
ALTER TABLE "ChatMessage" ALTER COLUMN "roomId" DROP DEFAULT;

INSERT INTO "ChatRoomRead" ("roomId", "userId", "readAt")
SELECT 'chat_room_general', "id", "chatReadAt" FROM "user" WHERE "chatReadAt" IS NOT NULL
ON CONFLICT DO NOTHING;

-- DropIndex
DROP INDEX "ChatMessage_createdAt_idx";

-- DropIndex
DROP INDEX "ChatMessage_updatedAt_idx";

-- CreateIndex
CREATE INDEX "ChatRoomRead_userId_idx" ON "ChatRoomRead"("userId");

-- CreateIndex
CREATE INDEX "ChatMessage_roomId_createdAt_idx" ON "ChatMessage"("roomId", "createdAt");

-- CreateIndex
CREATE INDEX "ChatMessage_roomId_updatedAt_idx" ON "ChatMessage"("roomId", "updatedAt");

-- AddForeignKey
ALTER TABLE "ChatRoom" ADD CONSTRAINT "ChatRoom_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatRoomRead" ADD CONSTRAINT "ChatRoomRead_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "ChatRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatRoomRead" ADD CONSTRAINT "ChatRoomRead_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "ChatRoom"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
