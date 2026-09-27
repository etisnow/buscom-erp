import { describe, expect, it } from "vitest";
import { leadLetter, leadSchema } from "./lead";

const base = {
  requestId: "7c9e6679-7425-40de-944b-e07fc1f90ae7",
  kind: "callback",
  name: " Иван ",
  phone: "8 (912) 345-67-89",
  consent: true,
};

describe("leadSchema", () => {
  it("телефон нормализуется, пустые поля пропадают, согласие и ловушка в заявку не идут", () => {
    expect(leadSchema.parse({ ...base, model: " ", task: "", website: "" })).toEqual({
      requestId: base.requestId,
      kind: "callback",
      name: "Иван",
      phone: "+79123456789",
      model: undefined,
      task: undefined,
    });
  });

  it("ошибки по полям все сразу", () => {
    const result = leadSchema.safeParse({ ...base, name: "", phone: "12", consent: false });
    expect(result.error?.issues.map((issue) => issue.path.join("."))).toEqual(
      expect.arrayContaining(["name", "phone", "consent"]),
    );
  });

  it("бот заполнил ловушку, чужой вид заявки — отказ", () => {
    expect(leadSchema.safeParse({ ...base, website: "x" }).success).toBe(false);
    expect(leadSchema.safeParse({ ...base, kind: "spam" }).success).toBe(false);
  });
});

describe("leadLetter", () => {
  it("обратный звонок: вид и телефон в теме, без пустых строк о модели", () => {
    const letter = leadLetter(leadSchema.parse(base), "https://bus-com.ru/kontakty");
    expect(letter.subject).toBe("Заявка с сайта: обратный звонок, +7 912 345-67-89");
    expect(letter.text).toContain("Имя: Иван\nТелефон: +7 912 345-67-89");
    expect(letter.text).not.toContain("Модель");
    expect(letter.text).toContain("Страница: https://bus-com.ru/kontakty");
  });

  it("салон целиком: модель и задача", () => {
    const lead = leadSchema.parse({ ...base, kind: "salon", model: "ГАЗель Next", task: "Перетяжка 16 мест" });
    const letter = leadLetter(lead, "https://bus-com.ru/");
    expect(letter.subject).toMatch(/^Заявка с сайта: салон целиком/);
    expect(letter.text).toContain("Модель авто: ГАЗель Next\n\nЗадача:\nПеретяжка 16 мест");
  });
});
