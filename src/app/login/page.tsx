import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getSessionUser } from "@/server/session";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Вход — BusCom ERP",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  // Вошедшему пользователю страница входа не нужна.
  if (await getSessionUser()) redirect("/orders");

  const { next } = await searchParams;

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">BusCom ERP</CardTitle>
          <CardDescription>Вход для сотрудников. Учётную запись заводит администратор.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <LoginForm next={typeof next === "string" ? next : undefined} />
          <Link href="/forgot-password" className="text-muted-foreground text-sm hover:underline">
            Забыли пароль?
          </Link>
        </CardContent>
      </Card>
    </main>
  );
}
