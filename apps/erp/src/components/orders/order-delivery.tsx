"use client";

import { useState, useTransition } from "react";
import { Loader2, ScanText } from "lucide-react";
import { toast } from "sonner";
import { DocumentUpload, type DocumentView } from "@/components/orders/document-upload";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
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
  recognizeWaybillAction,
  updateDeliveryAction,
  uploadOrderDocumentAction,
} from "@/app/(app)/orders/[number]/actions";

const NONE = "__none__";

type FilledField =
  "method" | "carrier" | "address" | "price" | "tracking" | "shipped" | "weight" | "length" | "width" | "height";

const FILLED_CLASS = "ring-2 ring-amber-400";

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
  const [recognizing, startRecognition] = useTransition();
  /** Поля, которые подставила накладная и которые ещё не сохранены, — подсвечены */
  const [filled, setFilled] = useState<Set<FilledField>>(new Set());
  const mark = (field: FilledField) => (filled.has(field) ? FILLED_CLASS : undefined);

  function fillFromWaybill() {
    startRecognition(async () => {
      const result = await recognizeWaybillAction(orderId);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      const found = result.fields;
      const changed = new Set<FilledField>();
      /** Подставляет найденное значение, если оно отличается от того, что в форме. */
      const apply = (field: FilledField, next: string | null, current: string, set: (value: string) => void) => {
        if (next === null || next === current) return;
        set(next);
        changed.add(field);
      };

      if (found.carrier || found.trackingNumber) apply("method", "CARRIER", method, setMethod);
      apply("carrier", found.carrier, carrierValue, setCarrier);
      apply("tracking", found.trackingNumber, tracking, setTracking);
      apply("shipped", found.shippedAt, shipped, setShipped);
      apply("weight", found.weightGrams === null ? null : formatWeightKg(found.weightGrams), weight, setWeight);
      apply("length", found.lengthCm?.toString() ?? null, length, setLength);
      apply("width", found.widthCm?.toString() ?? null, width, setWidth);
      apply("height", found.heightCm?.toString() ?? null, height, setHeight);
      if (canEditPrice) {
        apply("price", found.priceKopecks === null ? null : (found.priceKopecks / 100).toFixed(2), price, setPrice);
      }
      // В накладной только город назначения — точный адрес или терминал им не затираем.
      if (!address.trim()) apply("address", found.destination, address, setAddress);

      setFilled(changed);
      if (changed.size === 0) toast.info("Нового в накладной не нашлось — поля уже совпадают или не распознаны");
      else toast.success(`Подставлено полей: ${changed.size}. Проверьте подсвеченные и сохраните доставку`);
    });
  }

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
      if (result.ok) {
        toast.success("Доставка сохранена");
        setFilled(new Set());
      } else toast.error(result.error);
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
            <SelectTrigger id="delivery-method" size="sm" className={mark("method")}>
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
            <SelectTrigger id="delivery-carrier" size="sm" disabled={!canEdit} className={mark("carrier")}>
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
            className={cn("h-8", mark("address"))}
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
            className={cn("h-8 text-right", mark("price"))}
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
            className={cn("h-8", mark("tracking"))}
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
            className={cn("h-8", mark("shipped"))}
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
            className={cn("h-8 text-right", mark("weight"))}
          />
        </div>

        <fieldset className="flex flex-col gap-1.5 sm:col-span-2">
          <legend className="mb-1.5 text-xs font-medium">Габариты, см (длина × ширина × высота)</legend>
          <div className="flex min-w-0 items-center gap-2">
            {(
              [
                ["delivery-length", "Длина", length, setLength, "length"],
                ["delivery-width", "Ширина", width, setWidth, "width"],
                ["delivery-height", "Высота", height, setHeight, "height"],
              ] as const
            ).map(([id, label, value, setValue, field], index) => (
              <div key={id} className="flex min-w-0 flex-1 items-center gap-2">
                {index > 0 ? <span className="text-muted-foreground">×</span> : null}
                <Input
                  id={id}
                  aria-label={label}
                  placeholder={label.toLowerCase()}
                  inputMode="numeric"
                  value={value}
                  onChange={(event) => setValue(event.target.value)}
                  disabled={!canEdit}
                  className={cn("h-8 w-full min-w-0 text-right md:max-w-24", mark(field))}
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
            {waybill && canEdit ? (
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" variant="outline" disabled={recognizing} onClick={fillFromWaybill}>
                  {recognizing ? <Loader2 className="animate-spin" /> : <ScanText />}
                  {recognizing ? "Читаю накладную…" : "Заполнить из накладной"}
                </Button>
                <span className="text-muted-foreground text-xs">
                  {filled.size > 0
                    ? "Подсвеченные поля взяты из накладной — проверьте их со сканом, распознавание ошибается в цифрах"
                    : "Займёт до полуминуты; ничего не сохраняет — только подставит значения в поля"}
                </span>
              </div>
            ) : null}
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
