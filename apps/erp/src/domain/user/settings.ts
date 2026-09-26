/**
 * Личные настройки сотрудника — то, что каждый меняет себе сам, в отличие от
 * общих настроек системы в `src/domain/settings.ts`.
 */
import { z } from "zod";

/**
 * Почта для уведомлений. Пустое поле — «не задана»: тогда уведомления пойдут
 * на адрес входа. Регистр сводим к нижнему, как у адресов входа в Better Auth.
 */
export const notificationEmailSchema = z
  .string()
  .trim()
  .max(254, { error: "Адрес — не длиннее 254 символов" })
  .transform((value) => value.toLowerCase())
  .pipe(z.union([z.literal(""), z.email({ error: "Проверьте адрес почты" })]))
  .transform((value) => value || null);

/** Куда слать уведомления: своя почта, если задана, иначе адрес входа. */
export function notificationAddress(user: { email: string; notificationEmail: string | null }): string {
  return user.notificationEmail ?? user.email;
}
