"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { rublesToKopecks } from "@/domain/money";
import type { DeliveryMethod } from "@/generated/prisma/enums";
import { updateDeliveryAction } from "@/app/(app)/orders/[number]/actions";

const METHOD_LABELS: Record<DeliveryMethod, string> = {
  PICKUP: "Самовывоз",
  CARRIER: "Транспортная компания",
  COURIER: "Своя доставка",
};

const NONE = "__none__";

export function OrderDelivery({
  orderId,
  orderNumber,
  deliveryMethod,
  carrier,
  deliveryAddress,
  deliveryPriceKopecks,
  trackingNumber,
  canEdit,
  canEditPrice,
}: {
  orderId: string;
  orderNumber: number;
  deliveryMethod: DeliveryMethod | null;
  carrier: string | null;
  deliveryAddress: string | null;
  deliveryPriceKopecks: number;
  trackingNumber: string | null;
  canEdit: boolean;
  canEditPrice: boolean;
}) {
  const [method, setMethod] = useState<string>(deliveryMethod ?? NONE);
  const [carrierValue, setCarrier] = useState(carrier ?? "");
  const [address, setAddress] = useState(deliveryAddress ?? "");
  const [price, setPrice] = useState((deliveryPriceKopecks / 100).toFixed(2));
  const [tracking, setTracking] = useState(trackingNumber ?? "");
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

    startTransition(async () => {
      const result = await updateDeliveryAction({
        orderId,
        orderNumber,
        deliveryMethod: method === NONE ? null : (method as DeliveryMethod),
        carrier: carrierValue,
        deliveryAddress: address,
        trackingNumber: tracking,
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
          <Input
            id="delivery-carrier"
            value={carrierValue}
            onChange={(event) => setCarrier(event.target.value)}
            disabled={!canEdit}
            className="h-8"
          />
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
