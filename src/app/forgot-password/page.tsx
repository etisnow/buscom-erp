import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ForgotPasswordForm } from "./forgot-password-form";

export const metadata: Metadata = {
  title: "Восстановление пароля — BusCom ERP",
};

export default function ForgotPasswordPage() {
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">Восстановление пароля</CardTitle>
          <CardDescription>Пришлём на рабочую почту ссылку для смены пароля. Она действует час.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <ForgotPasswordForm />
          <Link href="/login" className="text-muted-foreground text-sm hover:underline">
            Вернуться к входу
          </Link>
        </CardContent>
      </Card>
    </main>
  );
}
