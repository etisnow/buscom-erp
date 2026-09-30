import { describe, expect, it } from "vitest";
import { AVATAR_COLOR_COUNT, avatarColorIndex, avatarInitials, chatAvatar } from "./avatar";

describe("avatarInitials", () => {
  it("два слова — первые буквы обоих, заглавными", () => {
    expect(avatarInitials("Иван Петров")).toBe("ИП");
    expect(avatarInitials("анна мария иванова")).toBe("АМ");
    expect(avatarInitials("  Иван   Петров  ")).toBe("ИП");
  });

  it("одно слово — его первые две буквы", () => {
    expect(avatarInitials("Дмитрий")).toBe("ДМ");
    expect(avatarInitials("Администратор")).toBe("АД");
    expect(avatarInitials("Я")).toBe("Я");
  });

  it("знаки и эмодзи вокруг имени пропускаются; пусто — «?»", () => {
    expect(avatarInitials("«Иван» (менеджер)")).toBe("ИМ");
    expect(avatarInitials("")).toBe("?");
    expect(avatarInitials("   ")).toBe("?");
    expect(avatarInitials("😀")).toBe("?");
  });

  it("латиница тоже заглавными", () => {
    expect(avatarInitials("john smith")).toBe("JS");
  });
});

describe("avatarColorIndex", () => {
  it("один и тот же сотрудник — всегда один цвет, номер в пределах палитры", () => {
    expect(avatarColorIndex("cmu123abc")).toBe(avatarColorIndex("cmu123abc"));
    for (const id of ["a", "b", "cmuo5wcmm0000ygvanit6ryhx", "", "ю"]) {
      const index = avatarColorIndex(id);
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThan(AVATAR_COLOR_COUNT);
    }
  });

  it("разные сотрудники в основном получают разные цвета", () => {
    const ids = Array.from({ length: 24 }, (_, i) => `user-${i}`);
    const colors = new Set(ids.map(avatarColorIndex));
    expect(colors.size).toBeGreaterThanOrEqual(8);
  });
});

describe("chatAvatar", () => {
  it("собирает инициалы и цвет", () => {
    expect(chatAvatar({ id: "u1", name: "Иван Петров" })).toEqual({
      initials: "ИП",
      colorIndex: avatarColorIndex("u1"),
    });
  });
});
