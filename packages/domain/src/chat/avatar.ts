/**
 * Аватарка автора в ленте чата: кружок с двумя заглавными буквами и цветом фона, который зависит только
 * от сотрудника — у каждого свой, и он не меняется от сообщения к сообщению и от запуска к запуску.
 */

/** Сколько цветов фона в палитре (сами цвета — в компоненте ленты) */
export const AVATAR_COLOR_COUNT = 12;

/** Две заглавные буквы: первые буквы первых двух слов имени, у одного слова — его первые две буквы. */
export function avatarInitials(name: string): string {
  const words = name
    .split(/\s+/)
    .map((word) => Array.from(word).filter((char) => /[\p{L}\p{N}]/u.test(char)))
    .filter((letters) => letters.length > 0);
  if (words.length === 0) return "?";
  const letters = words.length >= 2 ? [words[0][0], words[1][0]] : words[0].slice(0, 2);
  return letters.join("").toLocaleUpperCase("ru");
}

/** Номер цвета из палитры по id сотрудника (FNV-1a), 0…AVATAR_COLOR_COUNT-1. */
export function avatarColorIndex(userId: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < userId.length; i++) {
    hash ^= userId.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash % AVATAR_COLOR_COUNT;
}

export function chatAvatar(user: { id: string; name: string }): { initials: string; colorIndex: number } {
  return { initials: avatarInitials(user.name), colorIndex: avatarColorIndex(user.id) };
}
