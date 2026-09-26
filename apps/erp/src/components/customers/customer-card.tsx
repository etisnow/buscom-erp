"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Merge, Phone, Trash, Trash2 } from "lucide-react";
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
  CUSTOMER_REQUISITES_FIELDS,
  CUSTOMER_REQUISITES_LABELS,
  hasCustomerRequisites,
  type CustomerRequisites,
} from "@/domain/customer/requisites";
import { formatPhone } from "@/domain/datetime";
import type { CustomerType } from "@buscom/db/enums";
import type { CustomerMatch } from "@/server/customers/lookup";
import {
  addAddressAction,
  deleteAddressAction,
  deleteCustomerAction,
  findDuplicatesAction,
  mergeCustomersAction,
  updateCustomerAction,
  type CustomerResult,
} from "@/app/(app)/customers/actions";

export type CustomerFormData = {
  id: string;
  type: CustomerType;
  name: string;
  phone: string | null;
  email: string | null;
  inn: string | null;
  kpp: string | null;
  contactPerson: string | null;
  passport: string | null;
  requisites: CustomerRequisites;
  comment: string | null;
};

export type AddressRow = { id: string; address: string; isDefault: boolean };

function useAction() {
  const [pending, startTransition] = useTransition();

  function handle(action: Promise<CustomerResult>) {
    startTransition(async () => {
      const result = await action;
      if (result.ok) toast.success(result.message);
      else toast.error(result.error);
    });
  }

  return { pending, handle };
}

export function CustomerForm({ customer, editable }: { customer: CustomerFormData; editable: boolean }) {
  const [type, setType] = useState<CustomerType>(customer.type);
  const [name, setName] = useState(customer.name);
  const [phone, setPhone] = useState(customer.phone ?? "");
  const [email, setEmail] = useState(customer.email ?? "");
  const [inn, setInn] = useState(customer.inn ?? "");
  const [kpp, setKpp] = useState(customer.kpp ?? "");
  const [contactPerson, setContactPerson] = useState(customer.contactPerson ?? "");
  const [passport, setPassport] = useState(customer.passport ?? "");
  const [requisites, setRequisites] = useState(customer.requisites);
  const [comment, setComment] = useState(customer.comment ?? "");
  const { pending, handle } = useAction();

  return (
    <section className="flex flex-col gap-3 rounded-lg border p-4">
      <h2 className="font-heading font-medium">Данные клиента</h2>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs" htmlFor="customer-type">
            Тип
          </Label>
          <Select value={type} onValueChange={(value) => setType(value as CustomerType)} disabled={!editable}>
            <SelectTrigger id="customer-type" size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="PERSON">Физлицо</SelectItem>
              <SelectItem value="COMPANY">Юрлицо</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className="text-xs" htmlFor="customer-name">
            Имя или название
          </Label>
          <Input
            id="customer-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            disabled={!editable}
            className="h-8"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className="text-xs" htmlFor="customer-phone">
            Телефон
          </Label>
          <div className="flex gap-2">
            <Input
              id="customer-phone"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              disabled={!editable}
              className="h-8"
            />
            {/* На телефоне позвонить прямо отсюда; номер — сохранённый, а не недописанный в поле */}
            {customer.phone ? (
              <Button asChild variant="outline" size="icon" className="shrink-0 md:hidden" aria-label="Позвонить">
                <a href={`tel:${customer.phone}`}>
                  <Phone />
                </a>
              </Button>
            ) : null}
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className="text-xs" htmlFor="customer-email">
            Email
          </Label>
          <Input
            id="customer-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            disabled={!editable}
            className="h-8"
          />
        </div>

        {type === "COMPANY" ? (
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label className="text-xs" htmlFor="customer-contact">
              Контактное лицо
            </Label>
            <Input
              id="customer-contact"
              value={contactPerson}
              onChange={(event) => setContactPerson(event.target.value)}
              disabled={!editable}
              className="h-8"
            />
          </div>
        ) : (
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label className="text-xs" htmlFor="customer-passport">
              Паспорт
            </Label>
            <Input
              id="customer-passport"
              value={passport}
              onChange={(event) => setPassport(event.target.value)}
              disabled={!editable}
              className="h-8"
            />
          </div>
        )}

        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label className="text-xs" htmlFor="customer-comment">
            Комментарий
          </Label>
          <Textarea
            id="customer-comment"
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            disabled={!editable}
            rows={2}
          />
        </div>
      </div>

      {type === "COMPANY" ? (
        <details className="border-t pt-3" open={hasCustomerRequisites(requisites) || Boolean(inn) || Boolean(kpp)}>
          <summary className="cursor-pointer text-sm font-medium">Реквизиты юр. лица</summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <InnField
              id="customer-inn"
              value={inn}
              onChange={setInn}
              disabled={!editable}
              onFound={(company) => {
                const filled = applyCompanyInfo({ name, kpp, requisites }, company);
                setInn(company.inn || inn);
                setName(filled.name);
                setKpp(filled.kpp);
                setRequisites(filled.requisites);
              }}
            />
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs" htmlFor="customer-kpp">
                КПП
              </Label>
              <Input
                id="customer-kpp"
                value={kpp}
                onChange={(event) => setKpp(event.target.value)}
                disabled={!editable}
                className="h-8"
              />
            </div>
            {CUSTOMER_REQUISITES_FIELDS.map((key) => (
              <div key={key} className="flex flex-col gap-1.5">
                <Label className="text-xs" htmlFor={`requisites-${key}`}>
                  {CUSTOMER_REQUISITES_LABELS[key]}
                </Label>
                <Input
                  id={`requisites-${key}`}
                  value={requisites[key]}
                  onChange={(event) => setRequisites((current) => ({ ...current, [key]: event.target.value }))}
                  disabled={!editable}
                  className="h-8"
                />
              </div>
            ))}
          </div>
        </details>
      ) : null}

      {editable ? (
        <div>
          <Button
            size="sm"
            variant="outline"
            disabled={pending || !name.trim()}
            onClick={() =>
              handle(
                updateCustomerAction(customer.id, {
                  type,
                  name,
                  phone,
                  email,
                  inn,
                  kpp,
                  contactPerson,
                  passport,
                  requisites,
                  comment,
                }),
              )
            }
          >
            Сохранить
          </Button>
          <p className="text-muted-foreground mt-2 text-xs">
            Телефон сохраняется в виде +7XXXXXXXXXX — по нему ERP узнаёт клиента в заказах с сайта.
          </p>
        </div>
      ) : null}
    </section>
  );
}

export function CustomerAddresses({
  customerId,
  addresses,
  editable,
}: {
  customerId: string;
  addresses: AddressRow[];
  editable: boolean;
}) {
  const [address, setAddress] = useState("");
  const [isDefault, setIsDefault] = useState(addresses.length === 0);
  const { pending, handle } = useAction();

  return (
    <section className="flex flex-col gap-3 rounded-lg border p-4">
      <h2 className="font-heading font-medium">Адреса доставки</h2>

      {addresses.length === 0 ? (
        <p className="text-muted-foreground text-sm">Адресов пока нет.</p>
      ) : (
        <ul className="flex flex-col gap-1 text-sm">
          {addresses.map((item) => (
            <li key={item.id} className="flex items-center gap-2">
              <span>{item.address}</span>
              {item.isDefault ? <span className="text-muted-foreground text-xs">по умолчанию</span> : null}
              {editable ? (
                <Button
                  variant="destructive"
                  size="icon"
                  className="ml-auto size-7"
                  aria-label="Удалить адрес"
                  disabled={pending}
                  onClick={() => handle(deleteAddressAction(customerId, item.id))}
                >
                  <Trash2 className="size-4" />
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {editable ? (
        <div className="flex flex-wrap items-end gap-2 border-t pt-3">
          <div className="flex flex-1 flex-col gap-1.5">
            <Label className="text-xs" htmlFor="address-value">
              Адрес или терминал
            </Label>
            <Input
              id="address-value"
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              className="h-8"
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isDefault}
              onChange={(event) => setIsDefault(event.target.checked)}
              className="size-4"
            />
            по умолчанию
          </label>
          <Button
            size="sm"
            variant="outline"
            disabled={pending || !address.trim()}
            onClick={() => {
              handle(addAddressAction(customerId, address, isDefault));
              setAddress("");
            }}
          >
            Добавить
          </Button>
        </div>
      ) : null}
    </section>
  );
}

export function MergeCustomers({ customerId, customerName }: { customerId: string; customerName: string }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<CustomerMatch[]>([]);
  const { pending, handle } = useAction();
  const [searching, startSearch] = useTransition();

  function search(value: string) {
    setQuery(value);
    startSearch(async () => {
      const found = await findDuplicatesAction(value);
      // Самого себя в кандидаты на слияние не предлагаем.
      setMatches(found.filter((item) => item.id !== customerId));
    });
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Merge />
        Объединить с дублем
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Объединение клиентов</DialogTitle>
            <DialogDescription>
              Заказы и адреса дубля переедут к «{customerName}», сам дубль будет удалён. Действие необратимо.
            </DialogDescription>
          </DialogHeader>

          <Input
            autoFocus
            value={query}
            onChange={(event) => search(event.target.value)}
            placeholder="Найдите дубль по имени, телефону или ИНН"
          />

          <div className="flex max-h-64 flex-col gap-1 overflow-y-auto">
            {matches.map((match) => (
              <div key={match.id} className="flex items-center gap-2 rounded-md border p-2 text-sm">
                <span className="flex flex-col">
                  <span>{match.name}</span>
                  <span className="text-muted-foreground text-xs">
                    {formatPhone(match.phone)}
                    {match.inn ? ` · ИНН ${match.inn}` : ""} · заказов: {match.ordersCount}
                  </span>
                </span>
                <Button
                  variant="destructive"
                  size="sm"
                  className="ml-auto"
                  disabled={pending}
                  onClick={() => {
                    handle(mergeCustomersAction(customerId, match.id));
                    setOpen(false);
                  }}
                >
                  Объединить
                </Button>
              </div>
            ))}
            {query.trim().length >= 3 && matches.length === 0 && !searching ? (
              <p className="text-muted-foreground px-1 py-3 text-sm">Похожих клиентов не нашлось.</p>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * Удаление клиента. Диалог свой, а не `confirm()`: браузерное окно блокирует
 * страницу и выглядит чужеродно. Клиента с заказами сервер удалить не даст —
 * сообщение об этом приходит оттуда и показывается как есть.
 */
export function DeleteCustomer({ customerId, customerName }: { customerId: string; customerName: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function remove() {
    startTransition(async () => {
      const result = await deleteCustomerAction(customerId);
      if (!result.ok) {
        toast.error(result.error);
        setOpen(false);
        return;
      }

      toast.success(result.message);
      router.push("/customers");
    });
  }

  return (
    <>
      <Button variant="destructive" size="sm" onClick={() => setOpen(true)}>
        <Trash />
        Удалить
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Удалить клиента?</DialogTitle>
            <DialogDescription>
              «{customerName}» и его адреса доставки будут удалены без возможности восстановить. Клиента, за которым
              числятся заказы, удалить нельзя — такой дубль объединяют с основным.
            </DialogDescription>
          </DialogHeader>

          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
              Отмена
            </Button>
            <Button variant="destructive" size="sm" disabled={pending} onClick={remove}>
              Удалить
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
