"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { linkEmailAction, markEmailsReadAction } from "@/app/(app)/mail/actions";

/** Открыли письмо — оно прочитано. */
export function MarkEmailRead({ id, unread }: { id: string; unread: boolean }) {
  useEffect(() => {
    if (unread) void markEmailsReadAction([id]);
  }, [id, unread]);
  return null;
}

/**
 * Привязка входящего к заказу: номер руками или один из заказов этого клиента.
 * Перепривязать можно и уже привязанное — автоматика по теме письма иногда ошибается.
 */
export function EmailLinkForm({
  emailId,
  currentOrderNumber,
  candidates,
}: {
  emailId: string;
  currentOrderNumber: number | null;
  candidates: { number: number; label: string }[];
}) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [pending, startTransition] = useTransition();

  function link(orderNumber: number) {
    startTransition(async () => {
      const result = await linkEmailAction(emailId, orderNumber);
      if (result.ok) {
        toast.success(`Письмо привязано к заказу №${orderNumber}`);
        setValue("");
        router.refresh();
      } else toast.error(result.error);
    });
  }

  return (
    <section className="flex flex-col gap-2 rounded-lg border p-4">
      <h2 className="font-heading font-medium">
        {currentOrderNumber ? "Перепривязать к заказу" : "Привязать к заказу"}
      </h2>
      {candidates.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {candidates
            .filter((order) => order.number !== currentOrderNumber)
            .map((order) => (
              <Button
                key={order.number}
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() => link(order.number)}
              >
                {order.label}
              </Button>
            ))}
        </div>
      ) : null}
      <form
        className="flex items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          const number = Number(value.replace(/\D/g, ""));
          if (number > 0) link(number);
          else toast.error("Введите номер заказа");
        }}
      >
        <Input
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="№ заказа"
          inputMode="numeric"
          className="h-8 w-32"
          aria-label="Номер заказа"
        />
        <Button type="submit" size="sm" disabled={pending}>
          Привязать
        </Button>
      </form>
    </section>
  );
}
