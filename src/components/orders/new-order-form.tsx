"use client";

import { useState, useTransition } from "react";
import { Trash2, UserCheck } from "lucide-react";
import { toast } from "sonner";
import { ItemSupplierCell } from "@/components/orders/item-supplier";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { formatPhone } from "@/domain/datetime";
import { ORDER_CREATE_SOURCES, ORDER_SOURCE_LABELS } from "@/domain/order/source";
import { formatRub, rublesToKopecks } from "@/domain/money";
import { DEFAULT_DISCOUNT_LIMIT_PERCENT, maxDiscountKopecks } from "@/domain/order/discount";
import type { CustomerMatch } from "@/server/customers/lookup";
import type { ProductSuggestion, ProductSupplierOption } from "@/server/products/search";
import {
  createOrderAction,
  lookupCustomersAction,
  searchProductsForNewOrderAction,
} from "@/app/(app)/orders/new/actions";

type Item = {
  productId: string | null;
  sku: string;
  name: string;
  priceKopecks: number;
  quantity: number;
  discountKopecks: number;
  supplierId: string | null;
  supplierName: string | null;
  supplierOptions: ProductSupplierOption[];
};

const SOURCES = ORDER_CREATE_SOURCES.map((value) => ({ value, label: ORDER_SOURCE_LABELS[value] }));

const DELIVERY = [
  { value: "PICKUP", label: "Самовывоз" },
  { value: "CARRIER", label: "Транспортная компания" },
  { value: "COURIER", label: "Своя доставка" },
] as const;

const NO_DELIVERY = "__none__";

function parseRubles(value: string): number {
  try {
    return rublesToKopecks(value === "" ? "0" : value);
  } catch {
    return 0;
  }
}

export function NewOrderForm() {
  const [source, setSource] = useState<string>("PHONE");

  const [customerQuery, setCustomerQuery] = useState("");
  const [matches, setMatches] = useState<CustomerMatch[]>([]);
  const [picked, setPicked] = useState<CustomerMatch | null>(null);
  const [customerType, setCustomerType] = useState<"PERSON" | "COMPANY">("PERSON");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [inn, setInn] = useState("");

  const [productQuery, setProductQuery] = useState("");
  const [suggestions, setSuggestions] = useState<ProductSuggestion[]>([]);
  const [items, setItems] = useState<Item[]>([]);

  const [discount, setDiscount] = useState("0.00");
  const [deliveryMethod, setDeliveryMethod] = useState<string>(NO_DELIVERY);
  const [carrier, setCarrier] = useState("");
  const [address, setAddress] = useState("");
  const [deliveryPrice, setDeliveryPrice] = useState("0.00");
  const [comment, setComment] = useState("");

  const [pending, startTransition] = useTransition();

  const discountKopecks = parseRubles(discount);
  const deliveryPriceKopecks = parseRubles(deliveryPrice);
  const grossKopecks = items.reduce((sum, item) => sum + item.priceKopecks * item.quantity, 0);
  const itemsDiscount = items.reduce((sum, item) => sum + item.discountKopecks, 0);
  const itemsTotal = grossKopecks - itemsDiscount;
  const total = Math.max(0, itemsTotal - discountKopecks) + deliveryPriceKopecks;
  const limit = maxDiscountKopecks(grossKopecks);
  const overLimit = itemsDiscount + discountKopecks > limit;

  // Телефон нормализуется на сервере; здесь только ищем совпадения по мере ввода.
  function searchCustomers(value: string) {
    setCustomerQuery(value);
    setPicked(null);
    startTransition(async () => {
      setMatches(await lookupCustomersAction(value));
    });
  }

  function searchProducts(value: string) {
    setProductQuery(value);
    startTransition(async () => {
      setSuggestions(await searchProductsForNewOrderAction(value));
    });
  }

  function submit() {
    startTransition(async () => {
      const result = await createOrderAction({
        source: source as "PHONE",
        customerId: picked?.id,
        customer: picked ? undefined : { type: customerType, name, phone, email, inn },
        items: items.map((item) => ({
          productId: item.productId,
          sku: item.sku,
          name: item.name,
          priceKopecks: item.priceKopecks,
          quantity: item.quantity,
          discountKopecks: item.discountKopecks,
          supplierId: item.supplierId,
        })),
        discountKopecks,
        deliveryMethod: deliveryMethod === NO_DELIVERY ? null : (deliveryMethod as "PICKUP"),
        carrier,
        deliveryAddress: address,
        deliveryPriceKopecks,
        customerComment: comment,
      });
      // При успехе действие уводит на карточку и сюда не возвращается.
      if (result && !result.ok) toast.error(result.error);
    });
  }

  const canSubmit = items.length > 0 && (picked !== null || name.trim().length > 0);

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-3 rounded-lg border p-4">
        <h2 className="font-heading font-medium">Откуда заказ</h2>
        <div className="w-56">
          <Select value={source} onValueChange={setSource}>
            <SelectTrigger size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SOURCES.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </section>

      <section className="flex flex-col gap-3 rounded-lg border p-4">
        <h2 className="font-heading font-medium">Клиент</h2>

        <div className="flex flex-col gap-1.5">
          <Label className="text-xs" htmlFor="customer-search">
            Поиск по телефону, имени или ИНН
          </Label>
          <Input
            id="customer-search"
            value={customerQuery}
            onChange={(event) => searchCustomers(event.target.value)}
            placeholder="+7 916 123-45-67"
            className="h-8 max-w-md"
          />
        </div>

        {picked ? (
          <div className="flex items-center gap-2 rounded-md border p-2 text-sm">
            <UserCheck className="size-4 text-emerald-600" />
            <span>{picked.name}</span>
            <span className="text-muted-foreground">{formatPhone(picked.phone)}</span>
            <span className="text-muted-foreground text-xs">заказов: {picked.ordersCount}</span>
            <Button variant="ghost" size="sm" className="ml-auto" onClick={() => setPicked(null)}>
              Выбрать другого
            </Button>
          </div>
        ) : (
          <>
            {matches.length > 0 ? (
              <ul className="flex flex-col gap-1">
                {matches.map((match) => (
                  <li key={match.id}>
                    <button
                      type="button"
                      className="hover:bg-accent flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm"
                      onClick={() => setPicked(match)}
                    >
                      <span>{match.name}</span>
                      <span className="text-muted-foreground">{formatPhone(match.phone)}</span>
                      <span className="text-muted-foreground ml-auto text-xs">заказов: {match.ordersCount}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}

            <div className="grid gap-3 border-t pt-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs" htmlFor="customer-type">
                  Тип
                </Label>
                <Select value={customerType} onValueChange={(value) => setCustomerType(value as "PERSON")}>
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
                  className="h-8"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs" htmlFor="customer-phone">
                  Телефон
                </Label>
                <Input
                  id="customer-phone"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  className="h-8"
                />
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
                  className="h-8"
                />
              </div>
              {customerType === "COMPANY" ? (
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs" htmlFor="customer-inn">
                    ИНН
                  </Label>
                  <Input
                    id="customer-inn"
                    value={inn}
                    onChange={(event) => setInn(event.target.value)}
                    className="h-8"
                  />
                </div>
              ) : null}
            </div>
          </>
        )}
      </section>

      <section className="flex flex-col gap-3 rounded-lg border p-4">
        <h2 className="font-heading font-medium">Позиции</h2>

        <div className="flex flex-col gap-1.5">
          <Label className="text-xs" htmlFor="product-search">
            Найти товар по артикулу или названию
          </Label>
          <Input
            id="product-search"
            value={productQuery}
            onChange={(event) => searchProducts(event.target.value)}
            className="h-8 max-w-md"
          />
        </div>

        {suggestions.length > 0 ? (
          <ul className="flex max-h-56 flex-col gap-1 overflow-y-auto">
            {suggestions.map((product) => (
              <li key={product.id}>
                <button
                  type="button"
                  className="hover:bg-accent flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm"
                  onClick={() => {
                    setItems((current) => [
                      ...current,
                      {
                        productId: product.id,
                        sku: product.sku,
                        name: product.name,
                        priceKopecks: product.priceKopecks,
                        quantity: 1,
                        discountKopecks: 0,
                        // Самый дешёвый поставщик — первым в списке, его и подставляем.
                        supplierId: product.suppliers[0]?.id ?? null,
                        supplierName: product.suppliers[0]?.name ?? null,
                        supplierOptions: product.suppliers,
                      },
                    ]);
                    setProductQuery("");
                    setSuggestions([]);
                  }}
                >
                  <span>{product.name}</span>
                  <span className="text-muted-foreground text-xs">{product.sku}</span>
                  <span className="ml-auto">{formatRub(product.priceKopecks)}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        {items.length > 0 ? (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-32">Артикул</TableHead>
                  <TableHead>Название</TableHead>
                  <TableHead className="w-44">Поставщик</TableHead>
                  <TableHead className="w-28 text-right">Цена, ₽</TableHead>
                  <TableHead className="w-20 text-right">Кол-во</TableHead>
                  <TableHead className="w-28 text-right">Скидка, ₽</TableHead>
                  <TableHead className="w-28 text-right">Сумма</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item, index) => (
                  <TableRow key={`${item.sku}-${index}`}>
                    <TableCell>{item.sku}</TableCell>
                    <TableCell>{item.name}</TableCell>
                    <TableCell>
                      <ItemSupplierCell
                        item={{ ...item, purchasePriceKopecks: null }}
                        editable
                        onChange={(supplierId, supplierName) =>
                          setItems((current) =>
                            current.map((row, i) => (i === index ? { ...row, supplierId, supplierName } : row)),
                          )
                        }
                      />
                    </TableCell>
                    <TableCell className="text-right">{formatRub(item.priceKopecks)}</TableCell>
                    <TableCell className="text-right">
                      <Input
                        type="number"
                        min={1}
                        value={item.quantity}
                        onChange={(event) =>
                          setItems((current) =>
                            current.map((row, i) =>
                              i === index ? { ...row, quantity: Math.max(1, Number(event.target.value) || 1) } : row,
                            ),
                          )
                        }
                        className="h-8 text-right"
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <Input
                        inputMode="decimal"
                        value={(item.discountKopecks / 100).toFixed(2)}
                        onChange={(event) =>
                          setItems((current) =>
                            current.map((row, i) =>
                              i === index ? { ...row, discountKopecks: parseRubles(event.target.value) } : row,
                            ),
                          )
                        }
                        className="h-8 text-right"
                      />
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      {formatRub(item.priceKopecks * item.quantity - item.discountKopecks)}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        aria-label="Удалить позицию"
                        onClick={() => setItems((current) => current.filter((_, i) => i !== index))}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">Позиции не добавлены.</p>
        )}
      </section>

      <section className="flex flex-col gap-3 rounded-lg border p-4">
        <h2 className="font-heading font-medium">Доставка и итоги</h2>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs" htmlFor="new-delivery">
              Способ
            </Label>
            <Select value={deliveryMethod} onValueChange={setDeliveryMethod}>
              <SelectTrigger id="new-delivery" size="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_DELIVERY}>Не выбран</SelectItem>
                {DELIVERY.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs" htmlFor="new-carrier">
              Транспортная компания
            </Label>
            <Input
              id="new-carrier"
              value={carrier}
              onChange={(event) => setCarrier(event.target.value)}
              className="h-8"
            />
          </div>

          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label className="text-xs" htmlFor="new-address">
              Адрес или терминал
            </Label>
            <Input
              id="new-address"
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              className="h-8"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs" htmlFor="new-delivery-price">
              Стоимость доставки, ₽
            </Label>
            <Input
              id="new-delivery-price"
              inputMode="decimal"
              value={deliveryPrice}
              onChange={(event) => setDeliveryPrice(event.target.value)}
              className="h-8 text-right"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs" htmlFor="new-discount">
              Скидка на заказ, ₽
            </Label>
            <Input
              id="new-discount"
              inputMode="decimal"
              value={discount}
              onChange={(event) => setDiscount(event.target.value)}
              className="h-8 text-right"
            />
          </div>

          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label className="text-xs" htmlFor="new-comment">
              Комментарий клиента
            </Label>
            <Textarea id="new-comment" value={comment} onChange={(event) => setComment(event.target.value)} rows={2} />
          </div>
        </div>

        <dl className="grid w-fit grid-cols-[auto_auto] gap-x-6 gap-y-1 self-end text-sm">
          <dt className="text-muted-foreground">Товары</dt>
          <dd className="text-right">{formatRub(itemsTotal)}</dd>
          <dt className="text-muted-foreground">Доставка</dt>
          <dd className="text-right">{formatRub(deliveryPriceKopecks)}</dd>
          <dt className="text-muted-foreground">Скидка на заказ</dt>
          <dd className="text-right">−{formatRub(discountKopecks)}</dd>
          <dt className="font-medium">Итого</dt>
          <dd className="text-right font-medium">{formatRub(total)}</dd>
        </dl>

        {overLimit ? (
          <p className="text-destructive self-end text-sm">
            Скидка превышает лимит {DEFAULT_DISCOUNT_LIMIT_PERCENT}% ({formatRub(limit)}).
          </p>
        ) : null}
      </section>

      <div className="flex justify-end">
        <Button disabled={pending || !canSubmit} onClick={submit}>
          Создать заказ
        </Button>
      </div>
    </div>
  );
}
