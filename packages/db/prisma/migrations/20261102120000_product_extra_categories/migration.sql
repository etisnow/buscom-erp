CREATE TABLE "_ExtraProductCategories" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,
    CONSTRAINT "_ExtraProductCategories_AB_pkey" PRIMARY KEY ("A","B")
);
CREATE INDEX "_ExtraProductCategories_B_index" ON "_ExtraProductCategories"("B");
ALTER TABLE "_ExtraProductCategories" ADD CONSTRAINT "_ExtraProductCategories_A_fkey" FOREIGN KEY ("A") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "_ExtraProductCategories" ADD CONSTRAINT "_ExtraProductCategories_B_fkey" FOREIGN KEY ("B") REFERENCES "ProductCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;
