/**
 * Совместимость товара с моделями авто (docs/PRD.md, M3).
 *
 * Модели выбираются из справочника «Модели авто» (`DictionaryItem` типа `CAR_MODEL`),
 * а товар хранит их названия — как заказ хранит название ТК. У старых товаров могут
 * остаться названия, которых в справочнике нет (вводились текстом до справочника):
 * они не теряются, а показываются и сохраняются как есть, пока их не уберут.
 */

function clean(models: string[]): string[] {
  return [...new Set(models.map((model) => model.trim()).filter(Boolean))];
}

/**
 * Список моделей для сохранения: без пустых и повторов, в порядке справочника —
 * так бейджи в таблице стоят одинаково у всех товаров. Модели не из справочника — в конце.
 */
export function normalizeCompatibility(models: string[], dictionary: string[]): string[] {
  const selected = clean(models);
  const known = dictionary.filter((model) => selected.includes(model));
  const unknown = selected.filter((model) => !dictionary.includes(model));
  return [...known, ...unknown];
}

/** Модели, которых нет среди разрешённых, — сервер их не примет. */
export function unknownModels(models: string[], allowed: string[]): string[] {
  return clean(models).filter((model) => !allowed.includes(model));
}

/** Выбор модели в форме: нажатие добавляет её или снимает. */
export function toggleModel(models: string[], model: string): string[] {
  return models.includes(model) ? models.filter((item) => item !== model) : [...models, model];
}
