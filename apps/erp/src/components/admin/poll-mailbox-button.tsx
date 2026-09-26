"use client";

import { useTransition } from "react";
import { Mail } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { pollMailboxAction } from "@/app/(app)/admin/integration/actions";

/** Внеочередная проверка ящика заказов — сервер и так проверяет его по таймеру. */
export function PollMailboxButton({ configured }: { configured: boolean }) {
  const [pending, startTransition] = useTransition();

  function poll() {
    startTransition(async () => {
      const result = await pollMailboxAction();
      if (result.ok) toast.success(result.message);
      else toast.error(result.error);
    });
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={poll}
      disabled={pending || !configured}
      title={configured ? undefined : "Ящик не настроен: Администрирование → Настройки почты"}
    >
      <Mail />
      {pending ? "Проверяю…" : "Проверить почту"}
    </Button>
  );
}
