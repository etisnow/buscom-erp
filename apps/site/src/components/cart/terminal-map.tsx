"use client";

import { useEffect, useRef, useState } from "react";
import { cityKey } from "@buscom/domain/carrier/terminals";

/**
 * Карта пунктов выдачи в оформлении (Яндекс Карты, JS API v3). Точки ТК
 * собираются в кластеры; выбранный город — карта подгоняется под его пункты,
 * выбранный терминал подсвечен; нажатие на точку выбирает терминал.
 *
 * Скрипт API грузится только здесь и один раз на страницу — покупателям без
 * «Деловых линий» он не нужен. Не загрузился (нет сети, ключ не принят) —
 * карты просто нет, выбор списком работает и без неё.
 */

export type MapTerminal = { id: string; city: string; name: string; latitude: number | null; longitude: number | null };

/** Координаты в JS API v3 — [долгота, широта] */
type LngLat = [number, number];
type Location = { center: LngLat; zoom: number } | { bounds: [LngLat, LngLat] };

type YMapInstance = {
  addChild(child: unknown): YMapInstance;
  update(props: { location: Location & { duration?: number } }): void;
  destroy(): void;
  readonly zoom: number;
};
type Feature = { type: "Feature"; id: string; geometry: { type: "Point"; coordinates: LngLat } };
type Clusterer = { update(props: { marker: (feature: Feature) => unknown }): void };
type MarkerProps = { coordinates: LngLat; source: string; onClick?: () => void; zIndex?: number };
type YMaps = {
  ready: Promise<void>;
  YMap: new (element: HTMLElement, props: { location: Location }) => YMapInstance;
  YMapDefaultSchemeLayer: new () => unknown;
  YMapFeatureDataSource: new (props: { id: string }) => unknown;
  YMapLayer: new (props: { source: string; type: "markers"; zIndex: number }) => unknown;
  YMapMarker: new (props: MarkerProps, element: HTMLElement) => unknown;
  import: ((name: string) => Promise<unknown>) & { registerCdn(url: string, name: string): void };
};
type ClustererModule = {
  YMapClusterer: new (props: {
    method: unknown;
    features: Feature[];
    marker: (feature: Feature) => unknown;
    cluster: (coordinates: LngLat, features: Feature[]) => unknown;
  }) => Clusterer;
  clusterByGrid(options: { gridSize: number }): unknown;
};

const SOURCE = "terminals";
const CLUSTERER = "@yandex/ymaps3-clusterer@0.0.12";

let loading: Promise<{ ymaps: YMaps; clusterer: ClustererModule }> | null = null;

function loadMaps(apiKey: string) {
  loading ??= new Promise<YMaps>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `https://api-maps.yandex.ru/v3/?apikey=${encodeURIComponent(apiKey)}&lang=ru_RU`;
    script.onload = () => {
      const ymaps = (window as unknown as { ymaps3?: YMaps }).ymaps3;
      if (ymaps) ymaps.ready.then(() => resolve(ymaps), reject);
      else reject(new Error("JS API карт не отдал ymaps3"));
    };
    script.onerror = () => reject(new Error("JS API карт не загрузился"));
    document.head.append(script);
  }).then(async (ymaps) => {
    ymaps.import.registerCdn("https://cdn.jsdelivr.net/npm/{package}", CLUSTERER);
    return { ymaps, clusterer: (await ymaps.import("@yandex/ymaps3-clusterer")) as ClustererModule };
  });
  // Сбой не запоминаем: следующая попытка загрузит заново
  loading.catch(() => (loading = null));
  return loading;
}

/** Прямоугольник вокруг точек с запасом по краям: [северо-запад, юго-восток] */
function boundsOf(points: LngLat[]): [LngLat, LngLat] {
  const lngs = points.map((point) => point[0]);
  const lats = points.map((point) => point[1]);
  const [west, east, south, north] = [Math.min(...lngs), Math.max(...lngs), Math.min(...lats), Math.max(...lats)];
  const padLng = Math.max((east - west) * 0.15, 0.02);
  const padLat = Math.max((north - south) * 0.15, 0.01);
  return [
    [west - padLng, north + padLat],
    [east + padLng, south - padLat],
  ];
}

const coordinatesOf = (terminal: MapTerminal): LngLat | null =>
  terminal.latitude === null || terminal.longitude === null ? null : [terminal.longitude, terminal.latitude];

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
  const map = useRef<YMapInstance | null>(null);
  const clusterer = useRef<Clusterer | null>(null);
  const markerFor = useRef<((feature: Feature) => unknown) | null>(null);
  // Обработчики маркеров создаются один раз — свежие значения берут отсюда
  const latest = useRef({ selectedId, onSelect });
  useEffect(() => {
    latest.current = { selectedId, onSelect };
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

    loadMaps(apiKey).then(
      ({ ymaps, clusterer: module }) => {
        if (cancelled) return;
        const instance = new ymaps.YMap(element, {
          location: { bounds: boundsOf(points.map((point) => point.coordinates)) },
        });
        instance
          .addChild(new ymaps.YMapDefaultSchemeLayer())
          .addChild(new ymaps.YMapFeatureDataSource({ id: SOURCE }))
          .addChild(new ymaps.YMapLayer({ source: SOURCE, type: "markers", zIndex: 1800 }));

        const byId = new Map(points.map((point) => [point.terminal.id, point.terminal]));
        const marker = (feature: Feature) => {
          const selected = feature.id === latest.current.selectedId;
          const pin = document.createElement("div");
          pin.className = selected
            ? "bg-accent size-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-white shadow-md"
            : "bg-brand size-4 -translate-x-1/2 -translate-y-1/2 cursor-pointer rounded-full border-2 border-white shadow";
          pin.title = byId.get(feature.id)?.name ?? "";
          return new ymaps.YMapMarker(
            {
              coordinates: feature.geometry.coordinates,
              source: SOURCE,
              zIndex: selected ? 10 : 0,
              onClick: () => latest.current.onSelect(feature.id),
            },
            pin,
          );
        };
        const cluster = (coordinates: LngLat, features: Feature[]) => {
          const circle = document.createElement("div");
          circle.className =
            "bg-brand flex size-9 -translate-x-1/2 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full border-2 border-white text-sm font-semibold text-white shadow-md";
          circle.textContent = String(features.length);
          return new ymaps.YMapMarker(
            {
              coordinates,
              source: SOURCE,
              // Нажатие на кластер приближает к нему
              onClick: () =>
                instance.update({ location: { center: coordinates, zoom: instance.zoom + 3, duration: 300 } }),
            },
            circle,
          );
        };

        const created = new module.YMapClusterer({
          method: module.clusterByGrid({ gridSize: 64 }),
          features: points.map((point) => ({
            type: "Feature",
            id: point.terminal.id,
            geometry: { type: "Point", coordinates: point.coordinates },
          })),
          marker,
          cluster,
        });
        instance.addChild(created);
        map.current = instance;
        clusterer.current = created;
        markerFor.current = marker;
        setReady(true);
      },
      (error: unknown) => {
        console.error("[map] Карта не загрузилась", error);
        if (!cancelled) setFailed(true);
      },
    );

    return () => {
      cancelled = true;
      map.current?.destroy();
      map.current = null;
      clusterer.current = null;
      setReady(false);
    };
  }, [apiKey, terminals]);

  // Выбран город — показываем его пункты
  useEffect(() => {
    const points = terminals
      .filter((terminal) => cityKey(terminal.city) === cityKey(city))
      .map(coordinatesOf)
      .filter((point): point is LngLat => point !== null);
    if (!map.current || points.length === 0) return;
    map.current.update({
      location:
        points.length === 1
          ? { center: points[0]!, zoom: 14, duration: 400 }
          : { bounds: boundsOf(points), duration: 400 },
    });
  }, [city, terminals, ready]);

  // Выбран терминал — подсветка и приближение к нему
  useEffect(() => {
    if (!clusterer.current || !markerFor.current) return;
    // Новая функция маркера — сигнал кластеризатору перерисовать точки
    const marker = markerFor.current;
    clusterer.current.update({ marker: (feature) => marker(feature) });
    const terminal = terminals.find((item) => item.id === selectedId);
    const coordinates = terminal && coordinatesOf(terminal);
    if (coordinates) map.current?.update({ location: { center: coordinates, zoom: 14, duration: 400 } });
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
