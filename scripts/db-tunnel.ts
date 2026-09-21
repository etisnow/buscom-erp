/**
 * SSH-туннель до общей dev-базы. Запуск: `pnpm db:tunnel`, остановка — Ctrl+C.
 *
 * Общая база `buscom_erp_dev` живёт в том же Postgres, что и боевая, на сервере
 * Джино (см. docs/DEV-DB.md). Порт Postgres опубликован там только на loopback,
 * поэтому единственный путь внутрь — SSH. Туннель нужен всегда, когда работает
 * `pnpm dev`, `prisma migrate`, `prisma studio` или скрипты импорта.
 *
 * Хост берётся из `~/.ssh/config` по имени `buscom-prod` — адрес сервера, порт,
 * пользователь и ключ настраиваются на каждой машине отдельно и в репозиторий
 * (он публичный) не попадают. Пример записи — в docs/DEV-DB.md.
 *
 * Разрыв связи не роняет туннель: скрипт поднимает его заново. Так `pnpm dev`
 * переживает спящий режим ноутбука и смену сети.
 */
import { spawn } from "node:child_process";
import { createConnection } from "node:net";

const SSH_HOST = process.env.BUSCOM_SSH_HOST ?? "buscom-prod";
const LOCAL_PORT = Number(process.env.BUSCOM_DB_TUNNEL_PORT ?? 5433);
/** Адрес базы со стороны сервера: порт опубликован на его же loopback. */
const REMOTE = "127.0.0.1:5432";

const RETRY_DELAY_MS = 3000;

let stopping = false;

/** Занят ли порт: чаще всего это уже запущенный в соседнем окне туннель. */
function portBusy(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ host: "127.0.0.1", port });
    socket.setTimeout(1000);
    socket.on("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.on("error", () => resolve(false));
    socket.on("timeout", () => {
      socket.destroy();
      resolve(false);
    });
  });
}

function runTunnel(): Promise<number | null> {
  return new Promise((resolve) => {
    const ssh = spawn(
      "ssh",
      [
        "-N",
        "-L",
        `127.0.0.1:${LOCAL_PORT}:${REMOTE}`,
        // Обрыв замечается за ~30 секунд, а не висит до таймаута TCP
        "-o",
        "ServerAliveInterval=15",
        "-o",
        "ServerAliveCountMax=2",
        "-o",
        "ExitOnForwardFailure=yes",
        SSH_HOST,
      ],
      { stdio: ["ignore", "inherit", "inherit"] },
    );

    ssh.on("error", (error) => {
      console.error(`Не удалось запустить ssh: ${error.message}`);
      resolve(null);
    });
    ssh.on("exit", (code) => resolve(code));

    const stop = () => {
      stopping = true;
      ssh.kill();
    };
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
  });
}

async function main(): Promise<void> {
  if (await portBusy(LOCAL_PORT)) {
    console.error(`Порт ${LOCAL_PORT} уже занят — похоже, туннель запущен в другом окне. Второй не нужен.`);
    process.exit(1);
  }

  console.log(`Туннель: localhost:${LOCAL_PORT} → ${SSH_HOST} → ${REMOTE}`);
  console.log(`DATABASE_URL должен смотреть на localhost:${LOCAL_PORT}. Остановить — Ctrl+C.`);

  while (!stopping) {
    const code = await runTunnel();
    if (stopping) break;
    console.error(`Туннель закрылся (код ${code ?? "?"}), поднимаю заново через ${RETRY_DELAY_MS / 1000} с`);
    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
  }

  console.log("Туннель закрыт.");
}

void main();
