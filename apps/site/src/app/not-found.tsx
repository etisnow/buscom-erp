import Link from "next/link";

export default function NotFound() {
  return (
    <section className="space-y-4">
      <h1 className="text-3xl font-bold">Страница не найдена</h1>
      <p className="text-ink-2">Возможно, товар сняли с продажи или адрес набран с ошибкой.</p>
      <Link href="/" className="text-brand hover:text-brand-hover font-medium">
        На главную
      </Link>
    </section>
  );
}
