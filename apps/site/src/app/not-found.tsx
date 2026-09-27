import Link from "next/link";

export default function NotFound() {
  return (
    <section className="card flex max-w-2xl flex-col gap-4 p-6 md:p-8">
      <h1 className="page-title">Страница не найдена</h1>
      <p className="text-ink-2">Возможно, товар сняли с продажи или адрес набран с ошибкой.</p>
      <Link href="/" className="text-brand hover:text-brand-hover font-medium">
        На главную
      </Link>
    </section>
  );
}
