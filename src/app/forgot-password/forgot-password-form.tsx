"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requestResetAction, type ForgotState } from "./actions";

const initialState: ForgotState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? "Отправляем…" : "Отправить ссылку"}
    </Button>
  );
}

export function ForgotPasswordForm() {
  const [state, formAction] = useActionState(requestResetAction, initialState);

  if (state.sent) {
    return (
      <p className="text-sm">
        Если адрес {state.email} есть в системе, письмо со ссылкой уже отправлено. Проверьте почту, в том числе папку со
        спамом.
      </p>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="email">Рабочий email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          defaultValue={state.email}
          required
          autoFocus
        />
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
