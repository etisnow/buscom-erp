"use client";

import { useState, useTransition } from "react";
import { KeyRound, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatMoscowDate } from "@/domain/datetime";
import { ROLE_LABELS } from "@/domain/user/role";
import type { UserRole } from "@/generated/prisma/enums";
import type { UserRow } from "@/server/users/service";
import {
  changeRoleAction,
  createUserAction,
  resetPasswordAction,
  setActiveAction,
  type AdminResult,
} from "@/app/(app)/admin/users/actions";

const ROLES = Object.keys(ROLE_LABELS) as UserRole[];

/** Временный пароль: показываем администратору один раз, он передаёт его сотруднику. */
function suggestPassword(): string {
  const alphabet = "abcdefghijkmnpqrstuvwxyz23456789";
  let result = "";
  const random = new Uint32Array(12);
  crypto.getRandomValues(random);
  for (const value of random) result += alphabet[value % alphabet.length];
  return result;
}

export function UsersTable({ users, currentUserId }: { users: UserRow[]; currentUserId: string }) {
  const [pending, startTransition] = useTransition();
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<UserRole>("MANAGER");
  const [password, setPassword] = useState(suggestPassword);

  function handle(action: Promise<AdminResult>) {
    startTransition(async () => {
      const result = await action;
      if (result.ok) toast.success(result.message ?? "Готово");
      else toast.error(result.error);
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-xl font-semibold">Пользователи</h1>

        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <UserPlus />
              Добавить сотрудника
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Новый сотрудник</DialogTitle>
              <DialogDescription>
                Саморегистрации в системе нет. Передайте сотруднику email и временный пароль.
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="user-name">Имя</Label>
                <Input id="user-name" value={name} onChange={(event) => setName(event.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="user-email">Email</Label>
                <Input id="user-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="user-role">Роль</Label>
                <Select value={role} onValueChange={(value) => setRole(value as UserRole)}>
                  <SelectTrigger id="user-role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLES.map((item) => (
                      <SelectItem key={item} value={item}>
                        {ROLE_LABELS[item]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="user-password">Временный пароль</Label>
                <div className="flex gap-2">
                  <Input id="user-password" value={password} onChange={(event) => setPassword(event.target.value)} />
                  <Button variant="outline" onClick={() => setPassword(suggestPassword())}>
                    Другой
                  </Button>
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button variant="ghost" onClick={() => setCreateOpen(false)} disabled={pending}>
                Отмена
              </Button>
              <Button
                disabled={pending || !name.trim() || !email.trim()}
                onClick={() => {
                  handle(createUserAction({ name, email, role, password }));
                  setCreateOpen(false);
                  setName("");
                  setEmail("");
                  setPassword(suggestPassword());
                }}
              >
                Создать
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="min-w-0 overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Имя</TableHead>
              <TableHead>Email</TableHead>
              <TableHead className="w-48">Роль</TableHead>
              <TableHead className="w-24 text-right">Заказов</TableHead>
              <TableHead className="w-32">В системе с</TableHead>
              <TableHead className="w-56">Доступ</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((user) => {
              const isSelf = user.id === currentUserId;
              return (
                <TableRow key={user.id} className={user.isActive ? undefined : "opacity-60"}>
                  <TableCell>
                    {user.name}
                    {isSelf ? <span className="text-muted-foreground ml-1 text-xs">(вы)</span> : null}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{user.email}</TableCell>
                  <TableCell>
                    <Select
                      value={user.role}
                      disabled={pending}
                      onValueChange={(value) => handle(changeRoleAction(user.id, value))}
                    >
                      <SelectTrigger size="sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ROLES.map((item) => (
                          <SelectItem key={item} value={item}>
                            {ROLE_LABELS[item]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="text-right">{user.ordersCount}</TableCell>
                  <TableCell className="text-muted-foreground">{formatMoscowDate(user.createdAt)}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={pending || isSelf}
                        onClick={() => handle(setActiveAction(user.id, !user.isActive))}
                      >
                        {user.isActive ? "Отключить" : "Включить"}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={pending}
                        onClick={() => {
                          const next = suggestPassword();
                          handle(resetPasswordAction(user.id, next));
                          toast.info(`Новый пароль для ${user.email}: ${next}`, { duration: 30000 });
                        }}
                      >
                        <KeyRound />
                        Пароль
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <p className="text-muted-foreground text-xs">
        Отключённый сотрудник теряет все сессии сразу. Себя отключить или снять с себя роль администратора нельзя.
      </p>
    </div>
  );
}
