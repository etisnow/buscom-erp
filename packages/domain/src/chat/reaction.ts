/**
 * Реакции на сообщения чата: сотрудник ставит на сообщение эмодзи, повторное нажатие его снимает.
 * Одна и та же реакция от одного человека — одна; разных реакций на сообщении не больше
 * MAX_REACTION_KINDS, чтобы ряд под сообщением не разрастался.
 */
import { ChatError } from "./message";

export const MAX_REACTION_KINDS = 20;
const MAX_REACTION_LENGTH = 16;

/** Эмодзи целиком: знаки-картинки, селектор представления, соединитель (семьи, профессии), оттенки кожи. */
const EMOJI = /^\p{Extended_Pictographic}[\p{Extended_Pictographic}️‍\u{1F3FB}-\u{1F3FF}]*$/u;

/** Реакция перед сохранением: без пробелов по краям, только эмодзи. */
export function normalizeReaction(value: string): string {
  const emoji = value.trim();
  if (!emoji || emoji.length > MAX_REACTION_LENGTH || !EMOJI.test(emoji)) {
    throw new ChatError("Реакцией может быть только эмодзи");
  }
  return emoji;
}
