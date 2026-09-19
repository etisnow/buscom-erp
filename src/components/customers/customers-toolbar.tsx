"use client";

import { Search } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** Поиск и фильтр по типу клиента. Состояние — в URL. */
export function CustomersToolbar() {
  const router = useRouter();
  const searchParams = useSearchParams();

  function apply(changes: Record<string, string | null>) {
    const next = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(changes)) {
      if (value === null || value === "") next.delete(key);
      else next.set(key, value);
    }
    next.delete("page");
    router.push(`/customers?${next.toString()}`);
  }

  const type = searchParams.get("type");

  return (
    <div className="flex flex-wrap items-center gap-3">
      <form
        className="relative"
        onSubmit={(event) => {
          event.preventDefault();
          const value = new FormData(event.currentTarget).get("q");
          apply({ q: typeof value === "string" ? value.trim() : null });
        }}
      >
        <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
        <Input
          name="q"
          type="search"
          placeholder="Имя, телефон, email или ИНН"
          defaultValue={searchParams.get("q") ?? ""}
          className="h-8 w-80 pl-8"
        />
      </form>

      <Button variant={type === null ? "default" : "outline"} size="sm" onClick={() => apply({ type: null })}>
        Все
      </Button>
      <Button variant={type === "PERSON" ? "default" : "outline"} size="sm" onClick={() => apply({ type: "PERSON" })}>
        Физлица
      </Button>
      <Button variant={type === "COMPANY" ? "default" : "outline"} size="sm" onClick={() => apply({ type: "COMPANY" })}>
        Юрлица
      </Button>
    </div>
  );
}
