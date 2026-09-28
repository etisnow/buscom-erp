"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { CARRIERS } from "@buscom/domain/site/cart";
import { terminalsAction } from "@/app/korzina/actions";

type Terminal = Awaited<ReturnType<typeof terminalsAction>>[number];

/** Город для сравнения: регистр и «ё» не важны */
const cityKey = (city: string) => city.trim().toLowerCase().replaceAll("ё", "е");

/**
 * Доставка в оформлении (docs/SITE-PLAN.md, этап 5а). У ТК со справочником пунктов
 * (пока «Деловые линии») покупатель выбирает город из подсказок и терминал из списка —
 * в форму уходит только код терминала, адрес сервер берёт из базы. Своего города нет
 * или справочник недоступен — адрес вписывается руками, как у остальных ТК.
 */
export function DeliveryFields({
  input,
  field,
}: {
  /** Классы поля ввода формы */
  input: string;
  /** Ошибка поля от сервера */
  field: (name: string) => React.ReactNode;
}) {
  const [carrier, setCarrier] = useState("");
  /** ТК, для которой ждём список: ответ по прежней, если её успели сменить, отбрасывается */
  const requested = useRef("");
  const [terminals, setTerminals] = useState<Terminal[]>([]);
  const [loading, startLoading] = useTransition();
  const [manual, setManual] = useState(false);
  const [city, setCity] = useState("");
  const [terminalId, setTerminalId] = useState("");

  const cities = useMemo(() => [...new Set(terminals.map((terminal) => terminal.city))], [terminals]);
  const inCity = terminals.filter((terminal) => cityKey(terminal.city) === cityKey(city));
  const picking = terminals.length > 0 && !manual;

  function chooseCarrier(value: string) {
    setCarrier(value);
    setTerminals([]);
    setTerminalId("");
    setManual(false);
    requested.current = value;
    startLoading(async () => {
      const list = await terminalsAction(value);
      if (requested.current === value) setTerminals(list);
    });
  }

  function chooseCity(value: string) {
    setCity(value);
    // Единственный терминал в городе выбираем сразу — покупателю нечего решать
    const matching = terminals.filter((terminal) => cityKey(terminal.city) === cityKey(value));
    setTerminalId(matching.length === 1 ? matching[0]!.id : "");
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <label className="flex flex-col gap-1.5">
          <Label>Транспортная компания *</Label>
          <select
            name="carrier"
            value={carrier}
            onChange={(event) => chooseCarrier(event.target.value)}
            className={input}
          >
            <option value="" disabled>
              Выберите
            </option>
            {CARRIERS.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
          {field("carrier")}
        </label>

        {picking ? (
          <label className="flex flex-col gap-1.5">
            <Label>Город получения *</Label>
            <input
              list="terminal-cities"
              value={city}
              onChange={(event) => chooseCity(event.target.value)}
              autoComplete="address-level2"
              placeholder="Начните вводить город"
              className={input}
            />
            <datalist id="terminal-cities">
              {cities.map((item) => (
                <option key={item} value={item} />
              ))}
            </datalist>
          </label>
        ) : (
          <label className="flex flex-col gap-1.5">
            <Label>Город и адрес терминала или доставки *</Label>
            <input
              name="address"
              autoComplete="street-address"
              placeholder={loading ? "Загружаем терминалы…" : "Например, Казань, ул. Техническая, 20"}
              className={input}
            />
            {field("address")}
          </label>
        )}
      </div>

      {picking && (
        <div className="flex flex-col gap-2">
          {city.trim() && inCity.length === 0 && (
            <p className="text-ink-2 text-sm">
              В этом городе нет терминала «{carrier}». Выберите город из подсказок или впишите адрес вручную.
            </p>
          )}
          {inCity.length > 0 && (
            <div role="radiogroup" aria-label="Терминал" className="grid gap-2 md:grid-cols-2">
              {inCity.map((terminal) => (
                <label
                  key={terminal.id}
                  className={`flex cursor-pointer gap-3 rounded-xl border p-3.5 ${terminalId === terminal.id ? "border-brand bg-brand-soft" : "border-line-strong bg-white"}`}
                >
                  <input
                    type="radio"
                    name="terminalId"
                    value={terminal.id}
                    checked={terminalId === terminal.id}
                    onChange={() => setTerminalId(terminal.id)}
                    className="accent-brand mt-1"
                  />
                  <span className="flex flex-col gap-0.5">
                    <span className="font-semibold">{terminal.address}</span>
                    <span className="text-ink-2 text-[13px] leading-snug">{terminal.name}</span>
                    {terminal.schedule && (
                      <span className="text-ink-2 text-[13px] leading-snug">Выдача: {terminal.schedule}</span>
                    )}
                  </span>
                </label>
              ))}
            </div>
          )}
          {field("terminalId")}
          {field("address")}
          <button
            type="button"
            onClick={() => {
              setManual(true);
              setTerminalId("");
            }}
            className="text-brand self-start text-sm underline"
          >
            Нужна доставка до адреса или терминала нет в списке — вписать адрес
          </button>
        </div>
      )}
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <span className="text-muted text-[13px]">{children}</span>;
}
