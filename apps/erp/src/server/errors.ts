import "server-only";

/**
 * Ошибки прав и конфликтов, общие для сервисов. Отдельный модуль без зависимостей
 * от Next: серверные сервисы должны работать и вне запроса — в сидах, скриптах и тестах.
 */

/** Недостаточно прав: Server Action и route handler отдают это как 403. */
export class ForbiddenError extends Error {
  constructor(message = "Недостаточно прав для этого действия") {
    super(message);
    this.name = "ForbiddenError";
  }
}
