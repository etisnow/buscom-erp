-- Описание товара с сайта: текст, не HTML (docs/DECISIONS.md, «Описание товара»)

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "description" TEXT;
