-- Метка «Хит» у товара на сайте bus-com.ru (docs/SITE-PLAN.md, этап 4)
ALTER TABLE "Product" ADD COLUMN "isHit" BOOLEAN NOT NULL DEFAULT false;
