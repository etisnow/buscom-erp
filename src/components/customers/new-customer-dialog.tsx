"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Plus, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { InnField } from "@/components/customers/inn-field";
import { applyCompanyInfo } from "@/domain/customer/company-lookup";
import {
  CUSTOMER_REQUISITES_LABELS,
  EMPTY_CUSTOMER_REQUISITES,
  type CustomerRequisites,
} from "@/domain/customer/requisites";
import type { CustomerType } from "@/generated/prisma/enums";
import { createCustomerAction } from "@/app/(app)/customers/actions";

const EMPTY = { name: "", phone: "", email: "", inn: "", kpp: "", contactPerson: "", passport: "", comment: "" };

type AddressDraft = { address: string; isDefault: boolean };

const EMPTY_ADDRESS: AddressDraft = { address: "", isDefault: false };

/** Что из найденного по ИНН показать в форме до сохранения; банк по ИНН не найти. */
const FOUND_REQUISITES: (keyof CustomerRequisites)[] = ["legalName", "legalAddress", "ogrn", "signerName"];

/**
 * Заведение клиента до первого заказа (PRD, M2.4). Клиента не с сайта заводят
 * целиком и сразу, поэтому в форме есть и адреса доставки: иначе их пришлось бы
 * добавлять вторым заходом, уже в карточке.
 */
export function NewCustomerDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<CustomerType>("PERSON");
  const [fields, setFields] = useState(EMPTY);
  const [addresses, setAddresses] = useState<AddressDraft[]>([]);
  // Заполняется только кнопкой «Заполнить» по ИНН; руками реквизиты вводят в карточке.
  const [requisites, setRequisites] = useState<CustomerRequisites>(EMPTY_CUSTOMER_REQUISITES);
  // Найденный дубль: показываем ссылку на него вместо того, чтобы завести второго.
  const [existingId, setExistingId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function set(key: keyof typeof EMPTY, value: string) {
    setFields((current) => ({ ...current, [key]: value }));
    setExistingId(null);
  }

  function setAddress(index: number, patch: Partial<AddressDraft>) {
    setAddresses((current) =>
      current.map((item, i) => {
        if (i !== index) {
          // Адрес по умолчанию один: отмечая новый, снимаем признак с прежнего.
          return patch.isDefault ? { ...item, isDefault: false } : item;
        }
        return { ...item, ...patch };
      }),
    );
  }

  function submit() {
    startTransition(async () => {
      // Реквизиты — только юрлицу: сменили тип на физлицо — найденное не сохраняем
      const result = await createCustomerAction({
        type,
        ...fields,
        addresses,
        requisites: type === "COMPANY" ? requisites : undefined,
      });
      if (result.ok) {
        setOpen(false);
        setFields(EMPTY);
        setAddresses([]);
        setRequisites(EMPTY_CUSTOMER_REQUISITES);
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
        <DialogContent className="max-h-[90vh] grid-cols-[minmax(0,1fr)] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Новый клиент</DialogTitle>
            <DialogDescription>
              Обязательно только имя. Телефон сохранится в виде +7XXXXXXXXXX — по нему ERP узнаёт клиента в заказах с
              сайта и не даёт завести дубль. У юрлица кнопка «Заполнить» подтянет название и реквизиты по ИНН, банк
              вписывается в карточке.
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
                <InnField
                  id="new-customer-inn"
                  value={fields.inn}
                  onChange={(value) => set("inn", value)}
                  onFound={(company) => {
                    const filled = applyCompanyInfo({ name: fields.name, kpp: fields.kpp, requisites }, company);
                    setFields((current) => ({
                      ...current,
                      inn: company.inn || current.inn,
                      name: filled.name,
                      kpp: filled.kpp,
                    }));
                    setRequisites(filled.requisites);
                    setExistingId(null);
                  }}
                />
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

            {type === "COMPANY" && FOUND_REQUISITES.some((key) => requisites[key]) ? (
              <dl className="bg-muted/50 grid gap-1 rounded-md p-2 text-xs sm:col-span-2">
                {FOUND_REQUISITES.filter((key) => requisites[key]).map((key) => (
                  <div key={key} className="flex gap-2">
                    <dt className="text-muted-foreground w-28 shrink-0">{CUSTOMER_REQUISITES_LABELS[key]}</dt>
                    <dd className="min-w-0 break-words">{requisites[key]}</dd>
                  </div>
                ))}
              </dl>
            ) : null}

            {type === "COMPANY" ? (
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <Label className="text-xs" htmlFor="new-customer-contact">
                  Контактное лицо
                </Label>
                <Input
                  id="new-customer-contact"
                  value={fields.contactPerson}
                  onChange={(event) => set("contactPerson", event.target.value)}
                  className="h-8"
                />
              </div>
            ) : (
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <Label className="text-xs" htmlFor="new-customer-passport">
                  Паспорт
                </Label>
                <Input
                  id="new-customer-passport"
                  value={fields.passport}
                  onChange={(event) => set("passport", event.target.value)}
                  className="h-8"
                />
              </div>
            )}

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

          <div className="flex flex-col gap-2 border-t pt-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium">Адреса доставки</span>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setAddresses((current) => [...current, { ...EMPTY_ADDRESS, isDefault: !current.length }])
                }
              >
                <Plus />
                Добавить адрес
              </Button>
            </div>

            {addresses.length === 0 ? (
              <p className="text-muted-foreground text-xs">
                Необязательно — адрес можно добавить и позже, в карточке клиента.
              </p>
            ) : null}

            {addresses.map((item, index) => (
              // Строки без своего id: порядок не меняется, удаление сдвигает хвост целиком.
              <div key={index} className="flex flex-wrap items-end gap-2">
                <div className="flex min-w-40 flex-1 flex-col gap-1.5">
                  <Label className="text-xs" htmlFor={`new-address-value-${index}`}>
                    Адрес или терминал
                  </Label>
                  <Input
                    id={`new-address-value-${index}`}
                    value={item.address}
                    onChange={(event) => setAddress(index, { address: event.target.value })}
                    className="h-8"
                  />
                </div>
                <label className="flex h-8 items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={item.isDefault}
                    onChange={(event) => setAddress(index, { isDefault: event.target.checked })}
                    className="size-4"
                  />
                  по умолчанию
                </label>
                <Button
                  variant="destructive"
                  size="icon"
                  className="size-8"
                  aria-label="Убрать адрес"
                  onClick={() => setAddresses((current) => current.filter((_, i) => i !== index))}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
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
