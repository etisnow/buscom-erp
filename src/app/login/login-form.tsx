"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signInAction, type SignInState } from "./actions";

const initialState: SignInState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? "Входим…" : "Войти"}
    </Button>
  );
}

/**
 * `devCredentials` приходят заполненными только в разработке (см. `devLoginCredentials`
 * в `src/server/env.ts`) — в бою здесь `null`, и форма открывается пустой.
 */
export function LoginForm({
  next,
  devCredentials,
}: {
  next?: string;
  devCredentials: { email: string; password: string } | null;
}) {
  const [state, formAction] = useActionState(signInAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="next" value={next ?? ""} />
      <div className="flex flex-col gap-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          defaultValue={state.email ?? devCredentials?.email}
          required
          autoFocus
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="password">Пароль</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          defaultValue={devCredentials?.password}
          required
        />
      </div>

      {devCredentials ? (
        <p className="text-muted-foreground text-xs">
          Данные подставлены из <code>.env</code> — так работает только локальная разработка.
        </p>
      ) : null}

      {state.error ? (
        <p role="alert" className="text-destructive text-sm whitespace-pre-line">
          {state.error}
        </p>
      ) : null}

      <SubmitButton />
    </form>
  );
}
