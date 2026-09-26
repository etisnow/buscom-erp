"use client";

import { Search } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { useIsMobile } from "@/hooks/use-mobile";

/** Глобальный поиск заказа: №, № на сайте, телефон, email, ИНН, имя клиента (PRD, M1). */
export function OrderSearch() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Полная подсказка на телефоне не помещается в шапку и обрезается на полуслове
  const isMobile = useIsMobile();

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = new FormData(event.currentTarget).get("q");
    const value = typeof query === "string" ? query.trim() : "";
    router.push(value ? `/orders?q=${encodeURIComponent(value)}` : "/orders");
  }

  return (
    <form onSubmit={onSubmit} className="relative w-full max-w-md">
      <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
      <Input
        name="q"
        type="search"
        aria-label="Поиск заказа"
        placeholder={isMobile ? "№, телефон, клиент" : "Поиск заказа: №, телефон, email, ИНН, клиент"}
        defaultValue={searchParams.get("q") ?? ""}
        className="pl-8"
      />
    </form>
  );
}
