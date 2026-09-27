-- Тексты статических страниц сайта, правленные в ERP (docs/SITE-PLAN.md, этап 6)
-- CreateTable
CREATE TABLE "SitePage" (
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "metaTitle" TEXT NOT NULL,
    "metaDescription" TEXT,
    "body" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "SitePage_pkey" PRIMARY KEY ("slug")
);

-- AddForeignKey
ALTER TABLE "SitePage" ADD CONSTRAINT "SitePage_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

