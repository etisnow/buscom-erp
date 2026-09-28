"use client";

import { useEffect, useRef, useState } from "react";
import { cityKey } from "@buscom/domain/carrier/terminals";

/**
 * Карта пунктов выдачи в оформлении (Яндекс Карты, JS API 2.1). Точки ТК
 * собираются в кластеры; выбранный город — карта подгоняется под его пункты,
 * выбранный терминал подсвечен; нажатие на точку выбирает терминал.
 *
 * Версия 2.1, а не 3: ключ владельца (бесплатный тариф) v3 отвечает «Invalid api
 * key» с разрешённого адреса, 2.1 — принимает (29.09.2026, DECISIONS).
 *
 * Скрипт API грузится только здесь и один раз на страницу — покупателям без
 * ТК со справочником он не нужен. Не загрузился (нет сети, ключ не принят,
 * кончился суточный лимит) — карты нет, выбор списком работает и без неё.
 */

export type MapTerminal = { id: string; city: string; name: string; latitude: number | null; longitude: number | null };

/** Координаты в JS API 2.1 — [широта, долгота] */
type LatLng = [number, number];

type EventManager = { add(type: "click", handler: () => void): void };
type Placemark = { options: { set(key: "preset", value: string): void }; events: EventManager };
type GeoCollection = { add(object: unknown): void };
type YMap = {
  geoObjects: GeoCollection;
  setBounds(bounds: [LatLng, LatLng], options: { checkZoomRange: boolean; zoomMargin: number; duration: number }): void;
  setCenter(center: LatLng, zoom: number, options: { duration: number }): void;
  destroy(): void;
};
type YMaps = {
  ready(): Promise<void>;
  Map: new (
    element: HTMLElement,
    state: { bounds: [LatLng, LatLng]; controls: string[] },
    options: { suppressMapOpenBlock: boolean; yandexMapDisablePoiInteractivity: boolean },
  ) => YMap;
  Clusterer: new (options: { preset: string; groupByCoordinates: boolean; gridSize: number }) => {
    add(placemarks: Placemark[]): void;
  };
  Placemark: new (coordinates: LatLng, properties: { hintContent: string }, options: { preset: string }) => Placemark;
};

const PIN = "islands#greenDotIcon";
const PIN_SELECTED = "islands#orangeIcon";

let loading: Promise<YMaps> | null = null;

/**
 * Загрузка API — одна на страницу. Второй такой же скрипт Яндекс отвергает
 * («api is already enabled on this page»), поэтому признак берём со страницы, а
 * не только из переменной модуля: модуль бывает загружен заново (горячая
 * перезагрузка в разработке), а скрипт на странице остаётся.
 */
function loadMaps(apiKey: string): Promise<YMaps> {
  const page = window as unknown as { ymaps?: YMaps };
  if (page.ymaps) {
    const ymaps = page.ymaps;
    return ymaps.ready().then(() => ymaps);
  }
  const existing = document.querySelector<HTMLScriptElement>("script[data-yandex-maps]");
  loading ??= new Promise<YMaps>((resolve, reject) => {
    const script = existing ?? document.createElement("script");
    script.addEventListener("load", () => {
      if (page.ymaps) page.ymaps.ready().then(() => resolve(page.ymaps!), reject);
      else reject(new Error("JS API карт не отдал ymaps"));
    });
    script.addEventListener("error", () => {
      // Сбойный скрипт убираем: следующая попытка загрузит заново
      script.remove();
      reject(new Error("JS API карт не загрузился"));
    });
    if (!existing) {
      script.src = `https://api-maps.yandex.ru/2.1/?apikey=${encodeURIComponent(apiKey)}&lang=ru_RU`;
      script.dataset.yandexMaps = "";
      document.head.append(script);
    }
  });
  loading.catch(() => (loading = null));
  return loading;
}

/** Прямоугольник вокруг точек: [юго-запад, северо-восток] */
function boundsOf(points: LatLng[]): [LatLng, LatLng] {
  const lats = points.map((point) => point[0]);
  const lngs = points.map((point) => point[1]);
  return [
    [Math.min(...lats), Math.min(...lngs)],
    [Math.max(...lats), Math.max(...lngs)],
  ];
}

const coordinatesOf = (terminal: MapTerminal): LatLng | null =>
  terminal.latitude === null || terminal.longitude === null ? null : [terminal.latitude, terminal.longitude];

export function TerminalMap({
  apiKey,
  terminals,
  city,
  selectedId,
  onSelect,
}: {
  apiKey: string;
  terminals: MapTerminal[];
  /** Введённый город: совпал с городом пунктов — карта подгоняется под них */
  city: string;
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<YMap | null>(null);
  const placemarks = useRef(new Map<string, Placemark>());
  // Обработчики точек создаются один раз — свежий выбор берут отсюда
  const onSelectRef = useRef(onSelect);
  useEffect(() => {
    onSelectRef.current = onSelect;
  });
  const [failed, setFailed] = useState(false);
  /** Карта создана — подгонка под город и терминал, выбранные до её загрузки, срабатывает сейчас */
  const [ready, setReady] = useState(false);

  // Карта создаётся один раз на список пунктов
  useEffect(() => {
    const element = container.current;
    const points = terminals.flatMap((terminal) => {
      const coordinates = coordinatesOf(terminal);
      return coordinates ? [{ terminal, coordinates }] : [];
    });
    if (!element || points.length === 0) return;
    let cancelled = false;
    const created = placemarks.current;

    loadMaps(apiKey).then(
      (ymaps) => {
        if (cancelled) return;
        const instance = new ymaps.Map(
          element,
          { bounds: boundsOf(points.map((point) => point.coordinates)), controls: ["zoomControl"] },
          // Без кнопки «Открыть в Яндекс Картах» и без карточек чужих организаций по клику
          { suppressMapOpenBlock: true, yandexMapDisablePoiInteractivity: true },
        );
        const clusterer = new ymaps.Clusterer({
          preset: "islands#greenClusterIcons",
          groupByCoordinates: false,
          gridSize: 64,
        });
        clusterer.add(
          points.map(({ terminal, coordinates }) => {
            const placemark = new ymaps.Placemark(coordinates, { hintContent: terminal.name }, { preset: PIN });
            placemark.events.add("click", () => onSelectRef.current(terminal.id));
            created.set(terminal.id, placemark);
            return placemark;
          }),
        );
        instance.geoObjects.add(clusterer);
        map.current = instance;
        setReady(true);
      },
      (error: unknown) => {
        // Не error: карта необязательна, выбор списком работает и без неё
        console.warn("[map] Карта не загрузилась", error);
        if (!cancelled) setFailed(true);
      },
    );

    return () => {
      cancelled = true;
      map.current?.destroy();
      map.current = null;
      created.clear();
      setReady(false);
    };
  }, [apiKey, terminals]);

  // Выбран город — показываем его пункты
  useEffect(() => {
    const points = terminals
      .filter((terminal) => cityKey(terminal.city) === cityKey(city))
      .map(coordinatesOf)
      .filter((point): point is LatLng => point !== null);
    if (!map.current || points.length === 0) return;
    if (points.length === 1) map.current.setCenter(points[0]!, 14, { duration: 300 });
    else map.current.setBounds(boundsOf(points), { checkZoomRange: true, zoomMargin: 40, duration: 300 });
  }, [city, terminals, ready]);

  // Выбран терминал — подсветка и приближение к нему
  useEffect(() => {
    for (const [id, placemark] of placemarks.current) {
      placemark.options.set("preset", id === selectedId ? PIN_SELECTED : PIN);
    }
    const terminal = terminals.find((item) => item.id === selectedId);
    const coordinates = terminal && coordinatesOf(terminal);
    if (coordinates) map.current?.setCenter(coordinates, 15, { duration: 300 });
  }, [selectedId, terminals, ready]);

  if (failed) return null;
  return (
    <div
      ref={container}
      className="border-line-strong h-72 w-full overflow-hidden rounded-xl border md:h-80"
      aria-label="Карта пунктов выдачи"
    />
  );
}
