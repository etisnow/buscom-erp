/**
 * Подсказка совместимости по названию и описанию товара (docs/SITE-PLAN.md, этап 7:
 * фильтр и подбор по модели упираются в незаполненную совместимость — на 27.09
 * размечено 6 товаров из 221).
 *
 * Подсказка не решает за менеджера: модель предлагается, только если текст
 * называет её однозначно (поколение, кузов, годы) или у семейства в справочнике
 * всего одна модель. Упомянуто одно семейство («Sprinter», «Газель») — вариант
 * «уточните» со списком поколений из справочника.
 */

/** Текст в «скелете»: кириллица, похожая на латиницу, заменена латиницей */
type Text = string;

type Family = {
  family: string;
  /** Модели семейства — названия справочника «Модели авто» */
  models: string[];
  detect: (text: Text) => boolean;
  /** Признаки конкретной модели; модель, которой нет в справочнике, не предлагается */
  specific: [model: string, test: (text: Text) => boolean][];
};

/** Кириллица, похожая на латиницу: «Mеrсеdеs Sprintеr» бывает набран вперемешку */
const LOOKALIKES: Record<string, string> = {
  а: "a",
  в: "b",
  е: "e",
  к: "k",
  м: "m",
  н: "h",
  о: "o",
  р: "p",
  с: "c",
  т: "t",
  у: "y",
  х: "x",
};

/**
 * «ГАЗeль NEXT» и «Mеrсеdеs»: буквы двух алфавитов бывают перемешаны даже внутри
 * слова. Поэтому к одному виду приводятся и текст, и сами шаблоны ниже.
 */
const skeleton = (value: string) => value.replace(/[авекмнорстух]/g, (char) => LOOKALIKES[char]);

function prepare(raw: string): Text {
  return skeleton(raw.toLowerCase().replaceAll("ё", "е"));
}

/** Шаблон пишется как обычно, по-русски или по-английски, — в скелет его переводит `has` */
function has(pattern: RegExp): (text: Text) => boolean {
  const skeletal = new RegExp(skeleton(pattern.source), pattern.flags);
  return (text) => skeletal.test(text);
}

const FAMILIES: Family[] = [
  {
    family: "ГАЗель",
    models: ["ГАЗель Бизнес", "ГАЗель Next", "ГАЗель NN", "ГАЗель Next CitiLine"],
    detect: has(/газел|gazel/),
    specific: [
      ["ГАЗель Next CitiLine", has(/citiline|ситилайн/)],
      ["ГАЗель Next", has(/газел\S*\s*(next|некст)|\bnext\b.*газел/)],
      ["ГАЗель NN", has(/газел\S*\s*nn\b|газел.*\bnn\b/)],
      ["ГАЗель Бизнес", has(/газел\S*\s*бизнес/)],
    ],
  },
  { family: "ГАЗон", models: ["ГАЗон Next"], detect: has(/газон/), specific: [] },
  { family: "Соболь", models: ["ГАЗ Соболь"], detect: has(/собол/), specific: [] },
  { family: "Баргузин", models: ["ГАЗ Баргузин"], detect: has(/баргузин/), specific: [] },
  {
    family: "Mercedes Sprinter",
    models: ["Mercedes Sprinter Classic", "Mercedes Sprinter W906", "Mercedes Sprinter W907"],
    detect: has(/sprinter|спринтер/),
    specific: [
      ["Mercedes Sprinter Classic", has(/(sprinter|спринтер)\S*\s*(classic|классик)/)],
      ["Mercedes Sprinter W906", has(/w\s?906|кузо\S*\s*906/)],
      ["Mercedes Sprinter W907", has(/w\s?907|sprinter\s*907/)],
    ],
  },
  {
    family: "Volkswagen Crafter",
    models: ["Volkswagen Crafter W906", "Volkswagen Crafter 2017"],
    detect: has(/crafter|крафтер/),
    specific: [
      ["Volkswagen Crafter W906", has(/(crafter|крафтер)[^.;]{0,60}906/)],
      ["Volkswagen Crafter 2017", has(/(crafter|крафтер)[^.;]{0,20}2017/)],
    ],
  },
  {
    family: "Volkswagen LT",
    models: ["Volkswagen LT"],
    detect: has(/(volkswagen|фольксваген|vw)\s*lt\b/),
    specific: [],
  },
  {
    family: "Volkswagen Transporter",
    models: ["Volkswagen Transporter T5"],
    detect: has(/transporter|транспортер/),
    specific: [],
  },
  {
    family: "Ford Transit",
    models: ["Ford Transit 2000–2014", "Ford Transit 2015+"],
    detect: has(/transit|транзит/),
    specific: [
      ["Ford Transit 2000–2014", has(/(transit|транзит)[^.;]{0,40}(до 2014|20(00|06)\s*[-–—]\s*2014)/)],
      ["Ford Transit 2015+", has(/(transit|транзит)[^.;]{0,40}2015/)],
    ],
  },
  {
    family: "Fiat Ducato / Peugeot Boxer / Citroen Jumper",
    models: ["Fiat Ducato 244", "Fiat Ducato / Peugeot Boxer / Citroen Jumper X250 / X290"],
    detect: has(/ducato|дукато|boxer|боксер|jumper|джампер/),
    specific: [
      ["Fiat Ducato 244", has(/(ducato|дукато)\s*244/)],
      ["Fiat Ducato / Peugeot Boxer / Citroen Jumper X250 / X290", has(/x\s?250|x\s?290/)],
    ],
  },
  {
    family: "Citroen Jumpy / Peugeot Expert",
    models: ["Citroen Jumpy / Peugeot Expert 2017+"],
    detect: has(/jumpy|джампи|expert|эксперт/),
    specific: [],
  },
  {
    family: "Iveco Daily",
    models: ["Iveco Daily 2006–2014", "Iveco Daily 2015+"],
    detect: has(/daily|дейли|iveco|ивеко/),
    specific: [
      ["Iveco Daily 2006–2014", has(/(daily|дейли)[^.;]{0,40}(до 2014|2006\s*[-–—]\s*2014)/)],
      ["Iveco Daily 2015+", has(/(daily|дейли)[^.;]{0,40}2015/)],
    ],
  },
  {
    family: "Renault Master",
    models: ["Renault Master III"],
    detect: has(/(renault|рено)\s*(master|мастер)/),
    specific: [],
  },
];

export type CompatibilityHints = {
  /** Модели справочника, которые текст называет однозначно */
  suggested: string[];
  /** Упомянуто семейство без поколения — выбрать должен человек */
  unclear: { family: string; candidates: string[] }[];
};

/** `dictionary` — включённые модели справочника: только их и можно предложить. */
export function compatibilityHints(text: string, dictionary: readonly string[]): CompatibilityHints {
  const prepared = prepare(text);
  const suggested: string[] = [];
  const unclear: CompatibilityHints["unclear"] = [];
  for (const family of FAMILIES) {
    if (!family.detect(prepared)) continue;
    const candidates = family.models.filter((model) => dictionary.includes(model));
    if (candidates.length === 0) continue;
    // Поколение названо — предлагаем только его, даже если его нет в справочнике (тогда ничего):
    // «ГАЗель Next» при справочнике с одной «ГАЗель NN» не повод предложить NN
    const named = family.specific.filter(([, test]) => test(prepared)).map(([model]) => model);
    if (named.length > 0) suggested.push(...named.filter((model) => candidates.includes(model)));
    else if (family.models.length === 1) suggested.push(candidates[0]);
    else unclear.push({ family: family.family, candidates });
  }
  // Порядок справочника — как у выбранных моделей в карточке
  return { suggested: dictionary.filter((model) => suggested.includes(model)), unclear };
}
