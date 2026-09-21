import { pageNumber, single, type RawParams } from "@/app/(app)/search-params";
import type { ProductFilters } from "@/server/products/list";

export function parseProductListParams(params: RawParams): ProductFilters {
  return {
    query: single(params.q),
    categoryId: single(params.category),
    onlyInactive: single(params.inactive) === "1",
    page: pageNumber(params.page),
  };
}
