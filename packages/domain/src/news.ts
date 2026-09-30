/**
 * Новости платформы: запись журнала новых возможностей. Заголовок и текст обязательны;
 * текст — обычный, с абзацами, без разметки.
 */
import { z } from "zod";

export const MAX_NEWS_TITLE = 200;
export const MAX_NEWS_BODY = 10_000;

export const newsInputSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, { error: "Заголовок не может быть пустым" })
    .max(MAX_NEWS_TITLE, { error: `Заголовок длиннее ${MAX_NEWS_TITLE} символов` }),
  body: z
    .string()
    .transform((text) =>
      text
        .replace(/\r\n?/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim(),
    )
    .pipe(
      z
        .string()
        .min(1, { error: "Текст не может быть пустым" })
        .max(MAX_NEWS_BODY, { error: `Текст длиннее ${MAX_NEWS_BODY} символов` }),
    ),
});

export type NewsInput = z.infer<typeof newsInputSchema>;
