"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  linkEmailToCustomerAction,
  markEmailsReadAction,
  searchCustomersAction,
  type CustomerOption,
} from "@/app/(app)/mail/actions";

/** Открыли письмо — оно прочитано. */
export function MarkEmailRead({ id, unread }: { id: string; unread: boolean }) {
  useEffect(() => {
    if (unread) void markEmailsReadAction([id]);
  }, [id, unread]);
  return null;
}

/**
 * Привязка письма к клиенту — для писем с незнакомого адреса (или чтобы поправить
 * ошибочно определённого). Письма к заказам не привязываются: переписка — у
 * клиента, в заказе видны его последние письма.
 */
export function EmailCustomerForm({ emailId, hasCustomer }: { emailId: string; hasCustomer: boolean }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<CustomerOption[] | null>(null);
  const [pending, startTransition] = useTransition();

  function search() {
    startTransition(async () => {
      const found = await searchCustomersAction(query);
      setOptions(found);
      if (found.length === 0) toast.error("Клиент не найден");
    });
  }

  function link(customer: CustomerOption) {
    startTransition(async () => {
      const result = await linkEmailToCustomerAction(emailId, customer.id);
      if (result.ok) {
        toast.success(`Письмо в переписке клиента «${customer.name}»`);
        setOptions(null);
        setQuery("");
        router.refresh();
      } else toast.error(result.error);
    });
  }

  return (
    <section className="flex flex-col gap-2 rounded-lg border p-4">
      <h2 className="font-heading font-medium">{hasCustomer ? "Другой клиент" : "Привязать к клиенту"}</h2>
      <form
        className="flex items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (query.trim().length >= 2) search();
          else toast.error("Введите хотя бы два символа");
        }}
      >
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Имя, телефон, email или ИНН"
          className="h-8 w-72"
          aria-label="Поиск клиента"
        />
        <Button type="submit" size="sm" variant="outline" disabled={pending}>
          Найти
        </Button>
      </form>
      {options && options.length > 0 ? (
        <ul className="flex flex-col gap-1">
          {options.map((customer) => (
            <li key={customer.id} className="flex items-center justify-between gap-2 text-sm">
              <span className="min-w-0 truncate">
                {customer.name}
                <span className="text-muted-foreground ml-2 text-xs">
                  {[customer.phone, customer.email].filter(Boolean).join(" · ")}
                </span>
              </span>
              <Button size="sm" disabled={pending} onClick={() => link(customer)}>
                Привязать
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
