"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { DocumentUpload, type DocumentView } from "@/components/orders/document-upload";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { rublesToKopecks } from "@/domain/money";
import {
  CargoInputError,
  DELIVERY_METHOD_LABELS as METHOD_LABELS,
  formatWeightKg,
  parseSideCm,
  parseWeightKg,
  type Cargo,
} from "@/domain/order/delivery";
import { ORDER_DOCUMENT_LABELS } from "@/domain/order/order-document";
import type { DeliveryMethod } from "@/generated/prisma/enums";
import {
  deleteOrderDocumentAction,
  updateDeliveryAction,
  uploadOrderDocumentAction,
} from "@/app/(app)/orders/[number]/actions";

const NONE = "__none__";

export function OrderDelivery({
  orderId,
  orderNumber,
  deliveryMethod,
  carrier,
  deliveryAddress,
  deliveryPriceKopecks,
  trackingNumber,
  shippedAt,
  cargo,
  carriers,
  canEdit,
  canEditPrice,
  waybill,
  canManageDocuments,
}: {
  orderId: string;
  orderNumber: number;
  deliveryMethod: DeliveryMethod | null;
  carrier: string | null;
  deliveryAddress: string | null;
  deliveryPriceKopecks: number;
  trackingNumber: string | null;
  /** `2026-09-24` по Москве; пусто — не отгружен */
  shippedAt: string;
  cargo: Cargo;
  /** Справочник перевозчиков; текущий выбор в нём есть всегда — страница его добавляет */
  carriers: string[];
  canEdit: boolean;
  canEditPrice: boolean;
  /** Транспортная накладная (`OrderDocument`, вид `WAYBILL`); грузится сразу, без «Сохранить доставку» */
  waybill: DocumentView;
  canManageDocuments: boolean;
}) {
  const [method, setMethod] = useState<string>(deliveryMethod ?? NONE);
  const [carrierValue, setCarrier] = useState(carrier ?? "");
  const [address, setAddress] = useState(deliveryAddress ?? "");
  const [price, setPrice] = useState((deliveryPriceKopecks / 100).toFixed(2));
  const [tracking, setTracking] = useState(trackingNumber ?? "");
  const [shipped, setShipped] = useState(shippedAt);
  const [weight, setWeight] = useState(cargo.weightGrams === null ? "" : formatWeightKg(cargo.weightGrams));
  const [length, setLength] = useState(cargo.lengthCm?.toString() ?? "");
  const [width, setWidth] = useState(cargo.widthCm?.toString() ?? "");
  const [height, setHeight] = useState(cargo.heightCm?.toString() ?? "");
  const [pending, startTransition] = useTransition();

  function save() {
    let priceKopecks: number | undefined;
    if (canEditPrice) {
      try {
        priceKopecks = rublesToKopecks(price === "" ? "0" : price);
      } catch {
        toast.error("Некорректная стоимость доставки");
        return;
      }
    }

    let cargoValue: Cargo;
    try {
      cargoValue = {
        weightGrams: parseWeightKg(weight),
        lengthCm: parseSideCm(length, "Длина"),
        widthCm: parseSideCm(width, "Ширина"),
        heightCm: parseSideCm(height, "Высота"),
      };
    } catch (error) {
      toast.error(error instanceof CargoInputError ? error.message : "Некорректные вес или габариты");
      return;
    }

    startTransition(async () => {
      const result = await updateDeliveryAction({
        orderId,
        orderNumber,
        deliveryMethod: method === NONE ? null : (method as DeliveryMethod),
        carrier: carrierValue,
        deliveryAddress: address,
        trackingNumber: tracking,
        shippedAt: shipped,
        cargo: cargoValue,
        ...(priceKopecks === undefined ? {} : { deliveryPriceKopecks: priceKopecks }),
      });
      if (result.ok) toast.success("Доставка сохранена");
      else toast.error(result.error);
    });
  }

  return (
    <section className="flex flex-col gap-3 rounded-lg border p-4">
      <h2 className="font-heading font-medium">Доставка</h2>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs" htmlFor="delivery-method">
            Способ
          </Label>
          <Select value={method} onValueChange={setMethod} disabled={!canEdit}>
            <SelectTrigger id="delivery-method" size="sm">
              <SelectValue placeholder="не выбран" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Не выбран</SelectItem>
              {(Object.keys(METHOD_LABELS) as DeliveryMethod[]).map((item) => (
                <SelectItem key={item} value={item}>
                  {METHOD_LABELS[item]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className="text-xs" htmlFor="delivery-carrier">
            Транспортная компания
          </Label>
          <Select value={carrierValue || NONE} onValueChange={(value) => setCarrier(value === NONE ? "" : value)}>
            <SelectTrigger id="delivery-carrier" size="sm" disabled={!canEdit}>
              <SelectValue placeholder="не выбрана" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Не выбрана</SelectItem>
              {carriers.map((item) => (
                <SelectItem key={item} value={item}>
                  {item}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label className="text-xs" htmlFor="delivery-address">
            Адрес или терминал
          </Label>
          <Input
            id="delivery-address"
            value={address}
            onChange={(event) => setAddress(event.target.value)}
            disabled={!canEdit}
            className="h-8"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className="text-xs" htmlFor="delivery-price">
            Стоимость, ₽
          </Label>
          <Input
            id="delivery-price"
            inputMode="decimal"
            value={price}
            onChange={(event) => setPrice(event.target.value)}
            disabled={!canEditPrice}
            className="h-8 text-right"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className="text-xs" htmlFor="delivery-tracking">
            Трек-номер
          </Label>
          <Input
            id="delivery-tracking"
            value={tracking}
            onChange={(event) => setTracking(event.target.value)}
            disabled={!canEdit}
            className="h-8"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className="text-xs" htmlFor="delivery-shipped">
            Дата отгрузки
          </Label>
          <Input
            id="delivery-shipped"
            type="date"
            value={shipped}
            onChange={(event) => setShipped(event.target.value)}
            disabled={!canEdit}
            className="h-8"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className="text-xs" htmlFor="delivery-weight">
            Вес, кг
          </Label>
          <Input
            id="delivery-weight"
            inputMode="decimal"
            value={weight}
            onChange={(event) => setWeight(event.target.value)}
            disabled={!canEdit}
            className="h-8 text-right"
          />
        </div>

        <fieldset className="flex flex-col gap-1.5 sm:col-span-2">
          <legend className="mb-1.5 text-xs font-medium">Габариты, см (длина × ширина × высота)</legend>
          <div className="flex items-center gap-2">
            {(
              [
                ["delivery-length", "Длина", length, setLength],
                ["delivery-width", "Ширина", width, setWidth],
                ["delivery-height", "Высота", height, setHeight],
              ] as const
            ).map(([id, label, value, setValue], index) => (
              <div key={id} className="flex items-center gap-2">
                {index > 0 ? <span className="text-muted-foreground">×</span> : null}
                <Input
                  id={id}
                  aria-label={label}
                  placeholder={label.toLowerCase()}
                  inputMode="numeric"
                  value={value}
                  onChange={(event) => setValue(event.target.value)}
                  disabled={!canEdit}
                  className="h-8 w-24 text-right"
                />
              </div>
            ))}
          </div>
        </fieldset>

        {canManageDocuments || waybill ? (
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <span className="text-xs font-medium">{ORDER_DOCUMENT_LABELS.WAYBILL}</span>
            <DocumentUpload
              label="Загрузить накладную"
              document={waybill}
              href={(id) => `/api/order-documents/${id}`}
              editable={canManageDocuments}
              upload={(form) => uploadOrderDocumentAction(orderId, orderNumber, "WAYBILL", form)}
              remove={() => deleteOrderDocumentAction(orderId, orderNumber, "WAYBILL")}
            />
          </div>
        ) : null}
      </div>

      {method === "CARRIER" && !tracking.trim() ? (
        <p className="text-muted-foreground text-xs">
          Для доставки транспортной компанией нужен трек-номер — без него заказ не перевести в «Выполнен».
        </p>
      ) : null}

      {canEdit ? (
        <div>
          <Button size="sm" variant="outline" disabled={pending} onClick={save}>
            Сохранить доставку
          </Button>
        </div>
      ) : null}
    </section>
  );
}
