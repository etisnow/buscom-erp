-- CreateTable
CREATE TABLE "SalonLayout" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "seats" INTEGER NOT NULL,
    "armrests" INTEGER NOT NULL DEFAULT 0,
    "reclinerBacks" INTEGER NOT NULL DEFAULT 0,
    "imageData" BYTEA,
    "imageContentType" TEXT,
    "imageSourceUrl" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalonLayout_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SalonLayout_name_key" ON "SalonLayout"("name");

-- CreateIndex
CREATE INDEX "SalonLayout_isActive_sortOrder_idx" ON "SalonLayout"("isActive", "sortOrder");

-- Схемы из окна «Посчитать комплект» на bus-com.ru (30.09.2026). Подлокотники и откидные
-- спинки в них не указаны — их проставляет администратор в справочнике. Сами картинки
-- миграция не несёт: `pnpm erp import:salon-layout-images` скачивает их по imageSourceUrl.
INSERT INTO "SalonLayout" ("id", "name", "seats", "sortOrder", "imageSourceUrl", "updatedAt") VALUES
    ('salon_layout_14', '14 мест', 14, 10,
     'https://bus-com.ru/image/catalog/scheme-choice/14.jpg', CURRENT_TIMESTAMP),
    ('salon_layout_15', '15 мест', 15, 20,
     'https://bus-com.ru/image/catalog/scheme-choice/15.jpg', CURRENT_TIMESTAMP),
    ('salon_layout_15_closed', '15 мест, закрытый задний ряд', 15, 30,
     'https://bus-com.ru/image/catalog/scheme-choice/15%20%D0%B7%D0%B0%D0%BA%D1%80%D1%8B%D1%82%D0%B9%20%D1%80%D1%8F%D0%B4.jpg', CURRENT_TIMESTAMP),
    ('salon_layout_16_closed', '16 мест, закрытый задний ряд', 16, 40,
     'https://bus-com.ru/image/catalog/scheme-choice/16.jpg', CURRENT_TIMESTAMP),
    ('salon_layout_17', '17 мест', 17, 50,
     'https://bus-com.ru/image/catalog/scheme-choice/17.jpg', CURRENT_TIMESTAMP),
    ('salon_layout_17_front3', '17 мест, три спереди', 17, 60,
     'https://bus-com.ru/image/catalog/scheme-choice/17%20%D1%82%D1%80%D0%B8%20%D1%81%D0%BF%D0%B5%D1%80%D0%B5%D0%B4%D0%B8.jpg', CURRENT_TIMESTAMP),
    ('salon_layout_18_closed', '18 мест, закрытый задний ряд', 18, 70,
     'https://bus-com.ru/image/catalog/scheme-choice/18%20%D0%B7%D0%B0%D0%BA%D1%80%D1%8B%D1%82%D1%8B%D0%B9%20%D1%80%D1%8F%D0%B4.jpg', CURRENT_TIMESTAMP),
    ('salon_layout_18_front3_closed', '18 мест, три спереди, закрытый задний ряд', 18, 80,
     'https://bus-com.ru/image/catalog/scheme-choice/18%20%D1%82%D1%80%D0%B8%20%D1%81%D0%BF%D0%B5%D1%80%D0%B5%D0%B4%D0%B8,%20%D0%B7%D0%B0%D0%BA%D1%80%D1%8B%D1%82%D1%8B%D0%B9%20%D1%80%D1%8F%D0%B4.jpg', CURRENT_TIMESTAMP);
