-- Груз заказа для ТК (PRD, M5): вес и габариты. Колонки необязательные — старые заказы не трогаются.
ALTER TABLE "Order" ADD COLUMN "cargoWeightGrams" INTEGER,
ADD COLUMN "cargoLengthCm" INTEGER,
ADD COLUMN "cargoWidthCm" INTEGER,
ADD COLUMN "cargoHeightCm" INTEGER;
