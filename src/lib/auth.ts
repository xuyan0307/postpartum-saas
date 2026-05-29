import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

export class ApiError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

const cookieName = process.env.AUTH_COOKIE_NAME || "postpartum_session";

export async function setSession(userId: string, storeId?: string) {
  const cookieStore = await cookies();
  cookieStore.set(cookieName, JSON.stringify({ userId, storeId }), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 14,
  });
}

export async function clearSession() {
  const cookieStore = await cookies();
  cookieStore.delete(cookieName);
}

export async function getSession() {
  const raw = (await cookies()).get(cookieName)?.value;
  if (!raw) return null;
  try {
    return JSON.parse(raw) as { userId: string; storeId?: string };
  } catch {
    return null;
  }
}

export async function getCurrentContext() {
  const session = await getSession();
  if (!session?.userId) return null;
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    include: {
      memberships: {
        where: { active: true },
        include: { store: true, role: { include: { permissions: { include: { permission: true } } } } },
        orderBy: { createdAt: "asc" },
      },
      employee: true,
    },
  });
  if (!user || user.status !== "active") return null;
  const membership = user.memberships.find((item) => item.storeId === session.storeId) || user.memberships[0];
  return { user, membership, storeId: membership?.storeId };
}

export async function requireContext() {
  const context = await getCurrentContext();
  if (!context?.membership || !context.storeId) throw new ApiError("请先登录并选择门店", 401);
  return context;
}

export function requirePermission(context: Awaited<ReturnType<typeof requireContext>>, permission: string) {
  const permissions = context.membership.role.permissions.map((item) => item.permission.code);
  if (!permissions.includes("*") && !permissions.includes(permission)) {
    throw new ApiError("当前账号没有该操作权限", 403);
  }
}

export function publicContext(context: Awaited<ReturnType<typeof getCurrentContext>>) {
  if (!context) return { user: null };
  return {
    user: {
      id: context.user.id,
      name: context.user.name,
      email: context.user.email,
      phone: context.user.phone,
      employee: context.user.employee,
    },
    currentStoreId: context.storeId,
    stores: context.user.memberships.map((item) => ({
      id: item.store.id,
      name: item.store.name,
      city: item.store.city,
      role: item.role.name,
      roleCode: item.role.code,
      dataScope: item.dataScope,
    })),
    permissions: context.membership?.role.permissions.map((item) => item.permission.code) || [],
  };
}
