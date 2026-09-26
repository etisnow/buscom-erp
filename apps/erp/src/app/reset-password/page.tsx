import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ResetPasswordForm } from "./reset-password-form";

export const metadata: Metadata = {
  title: "Новый пароль — BusCom ERP",
};

export default async function ResetPasswordPage({ searchParams }: PageProps<"/reset-password">) {
  // Better Auth приводит сюда со своим токеном в адресе.
  const { token, error } = await searchParams;
  const value = typeof token === "string" ? token : "";

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">Новый пароль</CardTitle>
          <CardDescription>Придумайте пароль не короче 8 символов.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {value && !error ? (
            <ResetPasswordForm token={value} />
          ) : (
            <p className="text-destructive text-sm">
              Ссылка недействительна или истекла. Запросите новую на странице восстановления.
            </p>
          )}
          <Link href="/login" className="text-muted-foreground text-sm hover:underline">
            Вернуться к входу
          </Link>
        </CardContent>
      </Card>
    </main>
  );
}
