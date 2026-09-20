"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { CustomerType } from "@/generated/prisma/enums";
import { createCustomerAction } from "@/app/(app)/customers/actions";

const EMPTY = { name: "", phone: "", email: "", inn: "", kpp: "", comment: "" };

/**
 * Заведение клиента до первого заказа (PRD, M2.4). Обычно клиент появляется сам
 * при приёме заказа, поэтому форма короткая: остальное дозаполняется в карточке.
 */
export function NewCustomerDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<CustomerType>("PERSON");
  const [fields, setFields] = useState(EMPTY);
  // Найденный дубль: показываем ссылку на него вместо того, чтобы завести второго.
  const [existingId, setExistingId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function set(key: keyof typeof EMPTY, value: string) {
    setFields((current) => ({ ...current, [key]: value }));
    setExistingId(null);
  }

  function submit() {
    startTransition(async () => {
      const result = await createCustomerAction({ type, ...fields });
      if (result.ok) {
        setOpen(false);
        setFields(EMPTY);
        setType("PERSON");
        toast.success("Клиент заведён");
        router.push(`/customers/${result.id}`);
        return;
      }

      setExistingId(result.existingId ?? null);
      toast.error(result.error);
    });
  }

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <UserPlus />
        Новый клиент
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Новый клиент</DialogTitle>
            <DialogDescription>
              Обязательно только имя. Телефон сохранится в виде +7XXXXXXXXXX — по нему ERP узнает клиента в заказах с
              сайта.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs" htmlFor="new-customer-type">
                Тип
              </Label>
              <Select value={type} onValueChange={(value) => setType(value as CustomerType)}>
                <SelectTrigger id="new-customer-type" size="sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PERSON">Физлицо</SelectItem>
                  <SelectItem value="COMPANY">Юрлицо</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label className="text-xs" htmlFor="new-customer-name">
                Имя или название
              </Label>
              <Input
                id="new-customer-name"
                autoFocus
                value={fields.name}
                onChange={(event) => set("name", event.target.value)}
                className="h-8"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label className="text-xs" htmlFor="new-customer-phone">
                Телефон
              </Label>
              <Input
                id="new-customer-phone"
                value={fields.phone}
                onChange={(event) => set("phone", event.target.value)}
                className="h-8"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label className="text-xs" htmlFor="new-customer-email">
                Email
              </Label>
              <Input
                id="new-customer-email"
                type="email"
                value={fields.email}
                onChange={(event) => set("email", event.target.value)}
                className="h-8"
              />
            </div>

            {type === "COMPANY" ? (
              <>
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs" htmlFor="new-customer-inn">
                    ИНН
                  </Label>
                  <Input
                    id="new-customer-inn"
                    value={fields.inn}
                    onChange={(event) => set("inn", event.target.value)}
                    className="h-8"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs" htmlFor="new-customer-kpp">
                    КПП
                  </Label>
                  <Input
                    id="new-customer-kpp"
                    value={fields.kpp}
                    onChange={(event) => set("kpp", event.target.value)}
                    className="h-8"
                  />
                </div>
              </>
            ) : null}

            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label className="text-xs" htmlFor="new-customer-comment">
                Комментарий
              </Label>
              <Textarea
                id="new-customer-comment"
                value={fields.comment}
                onChange={(event) => set("comment", event.target.value)}
                rows={2}
              />
            </div>
          </div>

          {existingId ? (
            <p className="text-sm">
              Такой клиент уже есть.{" "}
              <Button variant="link" className="h-auto p-0" onClick={() => router.push(`/customers/${existingId}`)}>
                Открыть его карточку
              </Button>
            </p>
          ) : null}

          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
              Отмена
            </Button>
            <Button size="sm" disabled={pending || !fields.name.trim()} onClick={submit}>
              Завести
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
