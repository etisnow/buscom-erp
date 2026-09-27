import { describe, expect, it } from "vitest";
import { compatibilityHints } from "./compatibility-hints";

/** Справочник «Модели авто» как в базе на 27.09.2026 */
const DICTIONARY = [
  "Mercedes Sprinter Classic",
  "Mercedes Sprinter W906",
  "Mercedes Sprinter W907",
  "Volkswagen LT",
  "Volkswagen Crafter W906",
  "Volkswagen Crafter 2017",
  "Volkswagen Transporter T5",
  "Ford Transit 2000–2014",
  "Ford Transit 2015+",
  "Fiat Ducato 244",
  "Fiat Ducato / Peugeot Boxer / Citroen Jumper X250 / X290",
  "Citroen Jumpy / Peugeot Expert 2017+",
  "Iveco Daily 2006–2014",
  "Iveco Daily 2015+",
  "Renault Master III",
  "ГАЗель Бизнес",
  "ГАЗ Соболь",
  "ГАЗ Баргузин",
  "ГАЗель Next",
  "ГАЗель NN",
  "ГАЗель Next CitiLine",
  "ГАЗон Next",
];

const hints = (text: string) => compatibilityHints(text, DICTIONARY);

describe("compatibilityHints", () => {
  it("поколение названо — модель предлагается", () => {
    expect(hints("Сиденье тройное «ГАЗель Next», ткань").suggested).toEqual(["ГАЗель Next"]);
    expect(hints("Багажник на задние двери (рюкзак) на Mercedes Sprinter 907").suggested).toEqual([
      "Mercedes Sprinter W907",
    ]);
    expect(hints("Боковая подножка Mercedes-Benz Sprinter Classic.").suggested).toEqual(["Mercedes Sprinter Classic"]);
    expect(hints("Боковая подножка Volkswagen Crafter 2017").suggested).toEqual(["Volkswagen Crafter 2017"]);
  });

  it("несколько моделей в одном названии; порядок — как в справочнике", () => {
    expect(hints("Задняя подножка ГАЗель NEXT, ГАЗель NN.").suggested).toEqual(["ГАЗель Next", "ГАЗель NN"]);
  });

  it("годы выпуска решают поколение", () => {
    expect(hints("Боковая подножка Ford Transit 2006-2014гг..").suggested).toEqual(["Ford Transit 2000–2014"]);
    expect(hints("Электропривод сдвижной двери одномоторный Ford Transit (до 2014 г.в.), Турция").suggested).toEqual([
      "Ford Transit 2000–2014",
    ]);
    expect(hints("Боковая подножка Ford Transit 2015г.").suggested).toEqual(["Ford Transit 2015+"]);
  });

  it("латиница вперемешку с кириллицей не мешает", () => {
    const text =
      "Электропривод сдвижной двери двухмоторный Mеrсеdеs Sprintеr, Volkswаgen Crаfter (кузoв W906 c 2006 по 2018г.в.), ГАЗeль NEXT, Iveсо Daily, Мercеdеs Sprinter Сlassic, Турция";
    const result = hints(text);
    expect(result.suggested).toEqual([
      "Mercedes Sprinter Classic",
      "Mercedes Sprinter W906",
      "Volkswagen Crafter W906",
      "ГАЗель Next",
    ]);
    expect(result.unclear).toEqual([
      { family: "Iveco Daily", candidates: ["Iveco Daily 2006–2014", "Iveco Daily 2015+"] },
    ]);
  });

  it("одно семейство без поколения — «уточните», а не догадка", () => {
    expect(hints("Сиденье двойное Mercedes Sprinter, экокожа")).toEqual({
      suggested: [],
      unclear: [
        {
          family: "Mercedes Sprinter",
          candidates: ["Mercedes Sprinter Classic", "Mercedes Sprinter W906", "Mercedes Sprinter W907"],
        },
      ],
    });
  });

  it("у семейства одна модель в справочнике — предлагается сразу", () => {
    expect(hints("Диван раскладной на Газель / Газон").suggested).toEqual(["ГАЗон Next"]);
    expect(hints("Диван раскладной на Газель / Газон").unclear.map((item) => item.family)).toEqual(["ГАЗель"]);
    expect(hints("Сиденье для ГАЗ Соболь").suggested).toEqual(["ГАЗ Соболь"]);
  });

  it("модели не из справочника не предлагаются, пустой справочник — пусто", () => {
    expect(compatibilityHints("Сиденье ГАЗель Next", ["ГАЗель NN"])).toEqual({ suggested: [], unclear: [] });
    expect(compatibilityHints("Сиденье ГАЗель", ["ГАЗель NN"])).toEqual({
      suggested: [],
      unclear: [{ family: "ГАЗель", candidates: ["ГАЗель NN"] }],
    });
    expect(compatibilityHints("Сиденье ГАЗель Next", [])).toEqual({ suggested: [], unclear: [] });
  });

  it("без упоминаний моделей — пусто", () => {
    expect(hints("Клей для ткани 1 кг")).toEqual({ suggested: [], unclear: [] });
  });
});
