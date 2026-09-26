import type { Metadata } from "next";

// Метатеги главной — со старого сайта дословно (docs/site-snapshot/pages.json, «/»)
export const metadata: Metadata = {
  title: { absolute: "Баском. Комплектующие для микроавтобусов" },
  alternates: { canonical: "/" },
};

/** Главная. Блоки из макета (подбор по модели, популярные категории, хиты) — этап 4. */
export default function HomePage() {
  return (
    <section className="space-y-4">
      <h1 className="text-3xl font-bold">Комплектующие для микроавтобусов</h1>
      <p className="text-ink-2 max-w-2xl">
        Сиденья, люки, полки, поручни, подножки, детали салона и кузова. Отправляем транспортными компаниями по России,
        Беларуси, Казахстану и Киргизии.
      </p>
    </section>
  );
}
