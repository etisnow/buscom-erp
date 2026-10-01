"use client";

import { useId, useMemo, useRef, useState, useTransition } from "react";
import { cityKey, suggestCities } from "@buscom/domain/carrier/terminals";
import { CARRIERS } from "@buscom/domain/site/cart-core";
import { terminalsAction } from "@/app/korzina/actions";
import { TerminalMap } from "./terminal-map";

type Terminal = Awaited<ReturnType<typeof terminalsAction>>["terminals"][number];

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
  /** Ключ Яндекс Карт из ERP; нет — терминал выбирается без карты */
  const [mapsApiKey, setMapsApiKey] = useState<string | null>(null);
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
      const result = await terminalsAction(value);
      if (requested.current !== value) return;
      setTerminals(result.terminals);
      setMapsApiKey(result.mapsApiKey);
    });
  }

  function chooseCity(value: string) {
    setCity(value);
    // Единственный терминал в городе выбираем сразу — покупателю нечего решать
    const matching = terminals.filter((terminal) => cityKey(terminal.city) === cityKey(value));
    setTerminalId(matching.length === 1 ? matching[0]!.id : "");
  }

  /** Точка на карте: сразу и город, и терминал */
  function chooseOnMap(id: string) {
    const terminal = terminals.find((item) => item.id === id);
    if (!terminal) return;
    setCity(terminal.city);
    setTerminalId(terminal.id);
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
          <CityInput cities={cities} value={city} onChange={chooseCity} input={input} />
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
          {city.trim() && inCity.length === 0 && suggestCities(cities, city).length === 0 && (
            <p className="text-ink-2 text-sm">
              В этом городе нет терминала «{carrier}». Выберите город из подсказок или впишите адрес вручную.
            </p>
          )}
          {mapsApiKey && (
            <TerminalMap
              apiKey={mapsApiKey}
              terminals={terminals}
              city={city}
              selectedId={terminalId}
              onSelect={chooseOnMap}
            />
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

/**
 * Город с подсказками из справочника. Свой список, а не `<datalist>`: тот браузер
 * рисует по-своему (с системной прокруткой) и ищет совпадения с середины слова.
 */
function CityInput({
  cities,
  value,
  onChange,
  input,
}: {
  cities: string[];
  value: string;
  onChange: (city: string) => void;
  input: string;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const suggestions = open ? suggestCities(cities, value) : [];

  function pick(city: string) {
    onChange(city);
    setOpen(false);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (suggestions.length === 0) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive((current) => (current + step + suggestions.length) % suggestions.length);
    } else if (event.key === "Enter") {
      // Enter выбирает подсказку, а не отправляет форму
      event.preventDefault();
      pick(suggestions[active] ?? suggestions[0]!);
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <label className="relative flex flex-col gap-1.5">
      <Label>Город получения *</Label>
      <input
        role="combobox"
        aria-expanded={suggestions.length > 0}
        aria-controls={`${id}-list`}
        aria-autocomplete="list"
        aria-activedescendant={suggestions.length > 0 ? `${id}-${active}` : undefined}
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
        autoComplete="off"
        placeholder="Начните вводить город"
        className={input}
      />
      {suggestions.length > 0 && (
        <ul
          id={`${id}-list`}
          role="listbox"
          className="border-line-strong absolute top-full left-0 z-20 mt-1 w-full overflow-hidden rounded-xl border bg-white py-1 shadow-lg"
        >
          {suggestions.map((city, index) => (
            <li
              key={city}
              id={`${id}-${index}`}
              role="option"
              aria-selected={index === active}
              // mousedown, а не click: иначе поле потеряет фокус и список закроется раньше выбора
              onMouseDown={(event) => {
                event.preventDefault();
                pick(city);
              }}
              onMouseEnter={() => setActive(index)}
              className={`cursor-pointer px-3.5 py-2.5 text-[15px] ${index === active ? "bg-brand-soft" : ""}`}
            >
              {city}
            </li>
          ))}
        </ul>
      )}
    </label>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <span className="text-muted text-[13px]">{children}</span>;
}
