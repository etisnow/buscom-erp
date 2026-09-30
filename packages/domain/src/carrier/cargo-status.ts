/** Статус груза у перевозчика в одном виде для карточки заказа — ДЛ и ПЭК. */
export type CargoStatus = {
  /** Название статуса по-русски, как в кабинете перевозчика */
  stateName: string;
  /** Когда статус установлен, ISO с часовым поясом; `null` — перевозчик дату не прислал */
  stateDate: string | null;
  /** Груз выдан получателю */
  pickedUp: boolean;
};

export type CargoStatusResult = { ok: true; status: CargoStatus } | { ok: false; error: string };
