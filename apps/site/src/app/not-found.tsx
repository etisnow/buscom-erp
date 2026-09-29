import Link from "next/link";

export default function NotFound() {
  return (
    <section className="card flex max-w-2xl flex-col gap-4 p-6 md:p-8">
      <h1 className="page-title">Страница не найдена</h1>
      <p className="text-ink-2">Возможно, товар сняли с продажи или адрес набран с ошибкой.</p>
      <Link
        href="/"
        className="bg-accent hover:bg-accent-hover text-ink flex h-12 items-center justify-center self-start rounded-[10px] px-6 font-semibold"
      >
        На главную
      </Link>
    </section>
  );
}
