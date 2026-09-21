"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  CUSTOMER_REQUISITES_LABELS,
  EMPTY_CUSTOMER_REQUISITES,
  hasCustomerRequisites,
  type CustomerRequisites,
} from "@/domain/customer/requisites";
import type { CustomerType } from "@/generated/prisma/enums";

export type SupplierFormValue = {
  type: CustomerType;
  name: string;
  phone: string;
  email: string;
  inn: string;
  kpp: string;
  contactPerson: string;
  address: string;
  requisites: CustomerRequisites;
  comment: string;
};

export const EMPTY_SUPPLIER: SupplierFormValue = {
  type: "COMPANY",
  name: "",
  phone: "",
  email: "",
  inn: "",
  kpp: "",
  contactPerson: "",
  address: "",
  requisites: EMPTY_CUSTOMER_REQUISITES,
  comment: "",
};

const REQUISITES_FIELDS = Object.keys(CUSTOMER_REQUISITES_LABELS) as (keyof CustomerRequisites)[];

type TextField = Exclude<keyof SupplierFormValue, "type" | "requisites">;

/**
 * Поля поставщика — те же, что у клиента: физлицо или юрлицо, у юрлица ИНН, КПП,
 * контактное лицо и реквизиты. Общие для формы заведения и карточки.
 */
export function SupplierFields({
  value,
  onChange,
  disabled = false,
  idPrefix,
}: {
  value: SupplierFormValue;
  onChange: (value: SupplierFormValue) => void;
  disabled?: boolean;
  idPrefix: string;
}) {
  const isCompany = value.type === "COMPANY";

  function text(key: TextField, label: string, className?: string, type?: string) {
    return (
      <div className={`flex flex-col gap-1.5 ${className ?? ""}`}>
        <Label className="text-xs" htmlFor={`${idPrefix}-${key}`}>
          {label}
        </Label>
        <Input
          id={`${idPrefix}-${key}`}
          type={type}
          value={value[key]}
          onChange={(event) => onChange({ ...value, [key]: event.target.value })}
          disabled={disabled}
          className="h-8"
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs" htmlFor={`${idPrefix}-type`}>
            Тип
          </Label>
          <Select
            value={value.type}
            onValueChange={(type) => onChange({ ...value, type: type as CustomerType })}
            disabled={disabled}
          >
            <SelectTrigger id={`${idPrefix}-type`} size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="COMPANY">Юрлицо</SelectItem>
              <SelectItem value="PERSON">Физлицо</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {text("name", "Имя или название")}
        {text("phone", "Телефон")}
        {text("email", "Email", undefined, "email")}
        {isCompany ? text("inn", "ИНН") : null}
        {isCompany ? text("kpp", "КПП") : null}
        {isCompany ? text("contactPerson", "Контактное лицо", "sm:col-span-2") : null}
        {text("address", "Адрес", "sm:col-span-2")}

        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label className="text-xs" htmlFor={`${idPrefix}-comment`}>
            Комментарий
          </Label>
          <Textarea
            id={`${idPrefix}-comment`}
            value={value.comment}
            onChange={(event) => onChange({ ...value, comment: event.target.value })}
            disabled={disabled}
            rows={2}
          />
        </div>
      </div>

      {isCompany ? (
        <details className="border-t pt-3" open={hasCustomerRequisites(value.requisites)}>
          <summary className="cursor-pointer text-sm font-medium">Реквизиты</summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {REQUISITES_FIELDS.map((key) => (
              <div key={key} className="flex flex-col gap-1.5">
                <Label className="text-xs" htmlFor={`${idPrefix}-requisites-${key}`}>
                  {CUSTOMER_REQUISITES_LABELS[key]}
                </Label>
                <Input
                  id={`${idPrefix}-requisites-${key}`}
                  value={value.requisites[key]}
                  onChange={(event) =>
                    onChange({ ...value, requisites: { ...value.requisites, [key]: event.target.value } })
                  }
                  disabled={disabled}
                  className="h-8"
                />
              </div>
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}
