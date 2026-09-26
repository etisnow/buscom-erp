"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { resetPasswordAction, type ResetState } from "@/app/forgot-password/actions";

const initialState: ResetState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? "Сохраняем…" : "Сохранить пароль"}
    </Button>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, formAction] = useActionState(resetPasswordAction, initialState);

  if (state.done) {
    return (
      <div className="flex flex-col gap-3 text-sm">
        <p>Пароль изменён. Теперь можно войти с новым паролем.</p>
        <Button asChild>
          <Link href="/login">Войти</Link>
        </Button>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="token" value={token} />

      <div className="flex flex-col gap-2">
        <Label htmlFor="password">Новый пароль</Label>
        <Input id="password" name="password" type="password" autoComplete="new-password" required autoFocus />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="confirm">Повторите пароль</Label>
        <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required />
      </div>

      {state.error ? (
        <p role="alert" className="text-destructive text-sm whitespace-pre-line">
          {state.error}
        </p>
      ) : null}

      <SubmitButton />
    </form>
  );
}
