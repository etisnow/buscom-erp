import "server-only";
import { salonLayoutSchema, type SalonLayoutInput } from "@buscom/domain/site/salon-layout";
import { db } from "@/server/db";

export type SalonLayoutEntry = SalonLayoutInput & {
  id: string;
  sortOrder: number;
  isActive: boolean;
  /** Есть ли чертёж схемы: сама картинка отдаётся отдельным маршрутом */
  hasImage: boolean;
};

export async function listSalonLayouts(onlyActive = false): Promise<SalonLayoutEntry[]> {
  const rows = await db.salonLayout.findMany({
    where: onlyActive ? { isActive: true } : {},
    select: {
      id: true,
      name: true,
      seats: true,
      armrests: true,
      reclinerBacks: true,
      sortOrder: true,
      isActive: true,
      imageContentType: true,
    },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  return rows.map(({ imageContentType, ...row }) => ({ ...row, hasImage: imageContentType !== null }));
}

export async function readSalonLayoutImage(id: string): Promise<{ data: Uint8Array; contentType: string } | null> {
  const row = await db.salonLayout.findUnique({ where: { id }, select: { imageData: true, imageContentType: true } });
  if (!row?.imageData || !row.imageContentType) return null;
  return { data: row.imageData, contentType: row.imageContentType };
}

function parseLayout(input: unknown): SalonLayoutInput {
  const parsed = salonLayoutSchema.safeParse(input);
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Некорректная схема");
  return parsed.data;
}

async function assertNameFree(name: string, exceptId?: string): Promise<void> {
  const same = await db.salonLayout.findUnique({ where: { name }, select: { id: true } });
  if (same && same.id !== exceptId) throw new Error(`Схема «${name}» уже есть`);
}

export async function addSalonLayout(input: unknown): Promise<void> {
  const data = parseLayout(input);
  await assertNameFree(data.name);

  const last = await db.salonLayout.findFirst({ orderBy: { sortOrder: "desc" }, select: { sortOrder: true } });
  await db.salonLayout.create({ data: { ...data, sortOrder: (last?.sortOrder ?? 0) + 10 } });
}

export async function updateSalonLayout(id: string, input: unknown): Promise<void> {
  const data = parseLayout(input);
  await assertNameFree(data.name, id);
  await db.salonLayout.update({ where: { id }, data });
}

export async function setSalonLayoutActive(id: string, isActive: boolean): Promise<void> {
  await db.salonLayout.update({ where: { id }, data: { isActive } });
}

/** Пока на схему никто не ссылается, удаляется физически; когда появятся расчёты — только гасить. */
export async function deleteSalonLayout(id: string): Promise<void> {
  await db.salonLayout.delete({ where: { id } });
}
