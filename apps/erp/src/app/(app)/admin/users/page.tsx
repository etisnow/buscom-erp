import type { Metadata } from "next";
import { UsersTable } from "@/components/admin/users-table";
import { ADMIN_ROLES } from "@buscom/domain/user/role";
import { listUsers } from "@/server/users/service";
import { requirePageUser } from "@/server/session";

export const metadata: Metadata = {
  title: "Пользователи — BusCom ERP",
};

export default async function AdminUsersPage() {
  const user = await requirePageUser(ADMIN_ROLES);
  const users = await listUsers();

  return (
    <main className="flex flex-col gap-4">
      <UsersTable users={users} currentUserId={user.id} />
    </main>
  );
}
