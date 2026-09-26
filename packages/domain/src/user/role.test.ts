import { describe, expect, it } from "vitest";
import { ADMIN_ROLES, hasRole, roleLabel } from "./role";

describe("роли пользователей", () => {
  it("у каждой роли есть русское название", () => {
    expect(roleLabel("MANAGER")).toBe("Менеджер");
    expect(roleLabel("ADMIN")).toBe("Администратор");
  });

  it("администрирование доступно только ADMIN", () => {
    expect(hasRole("ADMIN", ADMIN_ROLES)).toBe(true);
    expect(hasRole("HEAD", ADMIN_ROLES)).toBe(false);
    expect(hasRole("MANAGER", ADMIN_ROLES)).toBe(false);
  });
});
