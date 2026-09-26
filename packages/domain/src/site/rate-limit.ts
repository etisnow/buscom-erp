/**
 * Ограничение частоты — скользящее окно в памяти процесса. Для одного
 * контейнера сайта этого достаточно; при нескольких экземплярах счётчик нужно
 * будет вынести в общее хранилище (Postgres или Redis).
 */
export class SlidingWindowLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    /** Сколько ключей держать; при переполнении старые выбрасываются — память не растёт без конца */
    private readonly maxKeys = 10_000,
  ) {}

  /** Засчитать попытку. false — лимит исчерпан, попытка не засчитана. */
  take(key: string, now = Date.now()): boolean {
    const recent = (this.hits.get(key) ?? []).filter((time) => now - time < this.windowMs);
    if (recent.length >= this.limit) {
      this.hits.set(key, recent);
      return false;
    }
    recent.push(now);
    this.hits.delete(key);
    this.hits.set(key, recent);
    if (this.hits.size > this.maxKeys) {
      const oldest = this.hits.keys().next().value;
      if (oldest !== undefined) this.hits.delete(oldest);
    }
    return true;
  }
}

/** IP покупателя из заголовков прокси: первый адрес `X-Forwarded-For`, иначе `X-Real-IP`. */
export function clientIp(forwardedFor: string | null, realIp: string | null): string | null {
  const first = forwardedFor?.split(",")[0]?.trim();
  return first || realIp?.trim() || null;
}
