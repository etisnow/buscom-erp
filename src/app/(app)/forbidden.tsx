import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Экран 403: показывается, когда страница вызвала `forbidden()` — у пользователя
 * есть сессия, но не та роль. Лежит внутри `(app)`, поэтому остаётся меню и шапка:
 * человеку видно, куда он может пойти вместо закрытого раздела.
 */
export default function Forbidden() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <ShieldAlert className="text-muted-foreground size-10" />
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-xl font-semibold">Недостаточно прав</h1>
        <p className="text-muted-foreground max-w-md text-sm">
          Этот раздел доступен другой роли. Если доступ нужен по работе — попросите администратора изменить роль.
        </p>
      </div>
      <Button asChild size="sm">
        <Link href="/orders">К заказам</Link>
      </Button>
    </main>
  );
}
