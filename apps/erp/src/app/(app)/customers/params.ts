import { z } from "zod";
import { pageNumber, single, type RawParams } from "@/app/(app)/search-params";
import type { CustomerFilters } from "@/server/customers/list";

/** Значения из URL приходят строками и могут быть чем угодно — разбираем схемой. */
const typeSchema = z.enum(["PERSON", "COMPANY"]);

export function parseCustomerListParams(params: RawParams): CustomerFilters {
  const type = typeSchema.safeParse(single(params.type));

  return {
    query: single(params.q),
    type: type.success ? type.data : undefined,
    page: pageNumber(params.page),
  };
}
