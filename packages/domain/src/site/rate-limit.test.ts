import { describe, expect, it } from "vitest";
import { clientIp, SlidingWindowLimiter } from "./rate-limit";

describe("ограничение частоты", () => {
  it("не больше limit попыток за окно, по каждому ключу отдельно", () => {
    const limiter = new SlidingWindowLimiter(2, 60_000);
    expect(limiter.take("a", 0)).toBe(true);
    expect(limiter.take("a", 1_000)).toBe(true);
    expect(limiter.take("a", 2_000)).toBe(false);
    expect(limiter.take("b", 2_000)).toBe(true);
  });

  it("окно скользит: старые попытки перестают считаться", () => {
    const limiter = new SlidingWindowLimiter(2, 60_000);
    limiter.take("a", 0);
    limiter.take("a", 30_000);
    expect(limiter.take("a", 59_999)).toBe(false);
    expect(limiter.take("a", 60_000)).toBe(true);
  });

  it("память ограничена: при переполнении выбрасывается самый старый ключ", () => {
    const limiter = new SlidingWindowLimiter(1, 60_000, 2);
    limiter.take("a", 0);
    limiter.take("b", 0);
    limiter.take("c", 0);
    expect(limiter.take("a", 1)).toBe(true);
  });

  it("IP — первый адрес X-Forwarded-For, иначе X-Real-IP, иначе неизвестен", () => {
    expect(clientIp("203.0.113.5, 10.0.0.1", "10.0.0.1")).toBe("203.0.113.5");
    expect(clientIp(null, "198.51.100.7")).toBe("198.51.100.7");
    expect(clientIp("", null)).toBeNull();
  });
});
