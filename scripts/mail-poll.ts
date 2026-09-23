/**
 * Один проход по ящику заказов — то же, что делает сервер по таймеру и кнопка
 * «Проверить почту» в журнале интеграции.
 *
 *   pnpm mail:poll
 *   pnpm mail:poll --from-uid 3     # перечитать ящик с письма UID 3 (дублей не будет)
 *
 * Если хостинг почты не открывается из этой сети — через SSH-проброс:
 *
 *   ssh -N -L 1993:mail.jino.ru:993 buscom-prod
 *   IMAP_VIA=127.0.0.1:1993 pnpm mail:poll
 */
import "dotenv/config";
import { describePoll, pollMailbox } from "../src/server/integrations/mailbox";

const fromUidArg = process.argv.find((arg) => arg.startsWith("--from-uid"));
const fromUid = fromUidArg
  ? Number(fromUidArg.includes("=") ? fromUidArg.split("=")[1] : process.argv[process.argv.indexOf(fromUidArg) + 1])
  : undefined;
if (fromUid !== undefined && !(Number.isInteger(fromUid) && fromUid > 0)) {
  console.error("--from-uid — номер письма (UID), целое больше нуля");
  process.exit(1);
}

pollMailbox({ fromUid })
  .then((summary) => {
    console.log(describePoll(summary));
    process.exit(0);
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
