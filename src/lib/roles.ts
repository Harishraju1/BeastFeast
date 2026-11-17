import type { Role } from "@/lib/types";

/** Admin dashboard access: admin and super_admin. */
export const isStaff = (role: Role | null | undefined) => role === "admin" || role === "super_admin";
/** Role management (promote / revoke admins): super_admin only. */
export const isSuperAdmin = (role: Role | null | undefined) => role === "super_admin";

export const ROLE_LABEL: Record<Role, string> = { student: "Student", admin: "Admin", super_admin: "Super Admin" };
