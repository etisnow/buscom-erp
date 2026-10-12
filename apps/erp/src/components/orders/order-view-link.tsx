"use client";

import Link from "next/link";
import type { ComponentProps } from "react";
import { rememberOrderFilters } from "@/components/orders/order-filters";

/**
 * Ссылка вкладки-вида, которая запоминает выбранную вкладку вместе с фильтрами:
 * заход на голый `/orders` открывает её же, а не ту, что была при последней правке фильтра.
 * `query` — строка запроса адреса ссылки.
 */
export function OrderViewLink({ query, ...props }: ComponentProps<typeof Link> & { query: string }) {
  return <Link {...props} onClick={() => rememberOrderFilters(new URLSearchParams(query))} />;
}
