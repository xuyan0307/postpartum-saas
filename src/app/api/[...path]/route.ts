import { NextRequest, NextResponse } from "next/server";
import { ApiError, clearSession, getCurrentContext, publicContext, requireContext, requirePermission, setSession } from "@/lib/auth";
import { hashPassword, verifyPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";
import { addDays, overlaps, todayString } from "@/lib/time";

type Params = { params: Promise<{ path?: string[] }> };

const json = (data: unknown, status = 200) => NextResponse.json(data, { status });

async function body<T>(request: NextRequest): Promise<T> {
  return (await request.json().catch(() => ({}))) as T;
}

async function handler(request: NextRequest, params: Params, method: string) {
  const path = (await params.params).path ?? [];
  const route = path.join("/");

  if (route === "auth/login" && method === "POST") return login(request);
  if (route === "auth/logout" && method === "POST") return logout();
  if (route === "auth/me" && method === "GET") return me();
  if (route === "auth/switch-store" && method === "POST") return switchStore(request);

  if (route === "stores" && method === "GET") return stores();
  if (route === "reports/dashboard" && method === "GET") return dashboard();
  if (route === "reports/conversion" && method === "GET") return conversionReport();

  if (route === "admin/employees") {
    if (method === "GET") return employees();
    if (method === "POST") return createEmployee(request);
  }
  if (route === "admin/roles" && method === "GET") return roles();
  if (route === "admin/audit-logs" && method === "GET") return auditLogs();

  if (route === "customers") {
    if (method === "GET") return customers();
    if (method === "POST") return createCustomer(request);
  }
  if (path[0] === "customers" && path[1]) {
    if (method === "GET") return customerDetail(path[1]);
    if (path[2] === "follow-ups" && method === "POST") return createFollowUp(path[1], request);
  }

  if (route === "leads") {
    if (method === "GET") return leads();
    if (method === "POST") return createLead(request);
  }
  if (path[0] === "leads" && path[1] && path[2] === "stage" && method === "PUT") return updateLeadStage(path[1], request);

  if (route === "services/items") {
    if (method === "GET") return serviceItems();
    if (method === "POST") return createServiceItem(request);
  }
  if (route === "services/packages") {
    if (method === "GET") return servicePackages();
    if (method === "POST") return createServicePackage(request);
  }
  if (route === "services/customer-packages") {
    if (method === "GET") return customerPackages();
    if (method === "POST") return createCustomerPackage(request);
  }
  if (route === "services/records" && method === "POST") return completeService(request);

  if (route === "schedule/appointments") {
    if (method === "GET") return appointments(request);
    if (method === "POST") return createAppointment(request);
  }
  if (route === "schedule/resources" && method === "GET") return scheduleResources();

  if (route === "orders") {
    if (method === "GET") return orders();
    if (method === "POST") return createOrder(request);
  }
  if (path[0] === "orders" && path[1] && path[2] === "payments" && method === "POST") return createPayment(path[1], request);
  if (path[0] === "orders" && path[1] && path[2] === "refunds" && method === "POST") return createRefund(path[1], request);

  if (route === "inventory/products") {
    if (method === "GET") return products();
    if (method === "POST") return createProduct(request);
  }

  if (route === "notifications" && method === "GET") return notifications();
  if (route === "marketing/campaigns" && method === "GET") return campaigns();

  throw new ApiError("接口不存在", 404);
}

async function login(request: NextRequest) {
  const data = await body<{ email?: string; password?: string; storeId?: string }>(request);
  const user = await prisma.user.findUnique({
    where: { email: String(data.email || "").trim() },
    include: { memberships: { where: { active: true }, orderBy: { createdAt: "asc" } } },
  });
  if (!user || !verifyPassword(String(data.password || ""), user.passwordHash)) throw new ApiError("账号或密码错误", 401);
  const storeId = data.storeId && user.memberships.some((item) => item.storeId === data.storeId) ? data.storeId : user.memberships[0]?.storeId;
  if (!storeId) throw new ApiError("账号未绑定门店", 403);
  await setSession(user.id, storeId);
  await log(storeId, user.id, "auth.login", "User", user.id);
  return me();
}

async function logout() {
  await clearSession();
  return json({ ok: true });
}

async function me() {
  return json(publicContext(await getCurrentContext()));
}

async function switchStore(request: NextRequest) {
  const context = await requireContext();
  const data = await body<{ storeId?: string }>(request);
  if (!context.user.memberships.some((item) => item.storeId === data.storeId)) throw new ApiError("无权访问该门店", 403);
  await setSession(context.user.id, data.storeId);
  return me();
}

async function stores() {
  const context = await requireContext();
  return json({ items: context.user.memberships.map((item) => item.store) });
}

async function dashboard() {
  const context = await requireContext();
  requirePermission(context, "reports:view");
  const storeId = context.storeId;
  const today = todayString();
  const [appointmentsToday, revenue, customersCount, leadsPending, packagesDue, pendingRefunds, lowStock] = await Promise.all([
    prisma.appointment.count({ where: { storeId, date: today, status: "booked" } }),
    prisma.payment.aggregate({ where: { storeId }, _sum: { amountCents: true } }),
    prisma.customer.count({ where: { storeId } }),
    prisma.lead.count({ where: { storeId, stage: { notIn: ["won", "lost"] } } }),
    prisma.customerPackage.count({ where: { storeId, status: "active", remainingSessions: { gt: 0 } } }),
    prisma.refundRequest.count({ where: { storeId, status: "pending" } }),
    prisma.stockItem.findMany({ where: { storeId }, include: { product: true }, take: 5 }),
  ]);
  const serviceStats = await prisma.serviceRecord.groupBy({ by: ["employeeId"], where: { storeId }, _count: { id: true } });
  return json({
    metrics: {
      appointmentsToday,
      revenueCents: revenue._sum.amountCents || 0,
      customersCount,
      leadsPending,
      packagesDue,
      pendingRefunds,
      lowStockCount: lowStock.filter((item) => item.quantity <= item.product.lowStockQty).length,
    },
    serviceStats,
  });
}

async function conversionReport() {
  const context = await requireContext();
  requirePermission(context, "reports:view");
  const stages = await prisma.lead.groupBy({ by: ["stage"], where: { storeId: context.storeId }, _count: { id: true } });
  const orders = await prisma.order.groupBy({ by: ["status"], where: { storeId: context.storeId }, _sum: { amountCents: true }, _count: { id: true } });
  return json({ stages, orders });
}

async function employees() {
  const context = await requireContext();
  requirePermission(context, "admin:employees");
  const items = await prisma.employee.findMany({ where: { storeId: context.storeId }, include: { position: true, user: true }, orderBy: { createdAt: "desc" } });
  return json({ items });
}

async function createEmployee(request: NextRequest) {
  const context = await requireContext();
  requirePermission(context, "admin:employees");
  const data = await body<{ name?: string; phone?: string; roleType?: string; positionName?: string }>(request);
  const position = await prisma.position.upsert({
    where: { storeId_name: { storeId: context.storeId, name: data.positionName || "产康师" } },
    update: {},
    create: { storeId: context.storeId, name: data.positionName || "产康师", category: data.roleType || "therapist" },
  });
  const item = await prisma.employee.create({
    data: { storeId: context.storeId, name: required(data.name, "姓名"), phone: required(data.phone, "手机号"), roleType: data.roleType || "therapist", positionId: position.id },
  });
  await log(context.storeId, context.user.id, "employee.create", "Employee", item.id);
  return json({ item });
}

async function roles() {
  const context = await requireContext();
  requirePermission(context, "admin:roles");
  return json({ items: await prisma.role.findMany({ include: { permissions: { include: { permission: true } } }, orderBy: { level: "desc" } }) });
}

async function auditLogs() {
  const context = await requireContext();
  requirePermission(context, "admin:audit");
  return json({ items: await prisma.auditLog.findMany({ where: { storeId: context.storeId }, include: { user: true }, orderBy: { createdAt: "desc" }, take: 80 }) });
}

async function customers() {
  const context = await requireContext();
  requirePermission(context, "customers:view");
  const where = advisorWhere(context, { storeId: context.storeId });
  const items = await prisma.customer.findMany({
    where,
    include: { advisor: true, tags: true, postpartumProfile: true, babies: true, packages: { include: { package: true } } },
    orderBy: { createdAt: "desc" },
  });
  return json({ items });
}

async function createCustomer(request: NextRequest) {
  const context = await requireContext();
  requirePermission(context, "customers:write");
  const data = await body<{ name?: string; phone?: string; source?: string; productionDate?: string; productionType?: string; babyName?: string }>(request);
  const item = await prisma.customer.create({
    data: {
      storeId: context.storeId,
      advisorId: context.user.id,
      name: required(data.name, "客户姓名"),
      phone: required(data.phone, "手机号"),
      source: data.source || "门店录入",
      productionDate: data.productionDate || null,
      productionType: data.productionType || null,
      babies: data.babyName ? { create: { storeId: context.storeId, name: data.babyName, gender: "unknown", birthday: data.productionDate || todayString(), feeding: "unknown" } } : undefined,
      postpartumProfile: { create: { storeId: context.storeId, stage: "产后恢复初评" } },
    },
  });
  await log(context.storeId, context.user.id, "customer.create", "Customer", item.id);
  return json({ item });
}

async function customerDetail(id: string) {
  const context = await requireContext();
  requirePermission(context, "customers:view");
  const item = await prisma.customer.findFirst({
    where: advisorWhere(context, { id, storeId: context.storeId }),
    include: {
      advisor: true,
      babies: true,
      postpartumProfile: true,
      tags: true,
      followUps: { include: { createdBy: true }, orderBy: { createdAt: "desc" } },
      packages: { include: { package: true, serviceRecords: true } },
      appointments: { include: { employee: true, serviceItem: true, room: true }, orderBy: [{ date: "desc" }, { startTime: "desc" }] },
      orders: { include: { payments: true, refunds: true }, orderBy: { createdAt: "desc" } },
    },
  });
  if (!item) throw new ApiError("客户不存在", 404);
  return json({ item });
}

async function createFollowUp(customerId: string, request: NextRequest) {
  const context = await requireContext();
  requirePermission(context, "customers:write");
  const customer = await prisma.customer.findFirst({ where: advisorWhere(context, { id: customerId, storeId: context.storeId }) });
  if (!customer) throw new ApiError("客户不存在", 404);
  const data = await body<{ channel?: string; content?: string; nextAction?: string; nextDate?: string }>(request);
  const item = await prisma.followUpRecord.create({
    data: { storeId: context.storeId, customerId, createdById: context.user.id, channel: data.channel || "电话", content: required(data.content, "跟进内容"), nextAction: data.nextAction || null, nextDate: data.nextDate || null },
  });
  return json({ item });
}

async function leads() {
  const context = await requireContext();
  requirePermission(context, "leads:view");
  const items = await prisma.lead.findMany({ where: advisorWhere(context, { storeId: context.storeId }), include: { source: true, advisor: true, history: true }, orderBy: { createdAt: "desc" } });
  return json({ items });
}

async function createLead(request: NextRequest) {
  const context = await requireContext();
  requirePermission(context, "leads:write");
  const data = await body<{ name?: string; phone?: string; sourceName?: string; intentLevel?: string; notes?: string }>(request);
  const source = await prisma.leadSource.upsert({
    where: { storeId_name: { storeId: context.storeId, name: data.sourceName || "自然到店" } },
    update: {},
    create: { storeId: context.storeId, name: data.sourceName || "自然到店" },
  });
  const item = await prisma.lead.create({ data: { storeId: context.storeId, sourceId: source.id, advisorId: context.user.id, name: required(data.name, "线索姓名"), phone: required(data.phone, "手机号"), intentLevel: data.intentLevel || "medium", notes: data.notes || null } });
  await prisma.leadStageHistory.create({ data: { storeId: context.storeId, leadId: item.id, toStage: "new", note: "线索创建" } });
  return json({ item });
}

async function updateLeadStage(id: string, request: NextRequest) {
  const context = await requireContext();
  requirePermission(context, "leads:write");
  const data = await body<{ stage?: string; note?: string; convert?: boolean }>(request);
  const existing = await prisma.lead.findFirst({ where: advisorWhere(context, { id, storeId: context.storeId }) });
  if (!existing) throw new ApiError("线索不存在", 404);
  const item = await prisma.lead.update({ where: { id }, data: { stage: data.stage || existing.stage } });
  await prisma.leadStageHistory.create({ data: { storeId: context.storeId, leadId: id, fromStage: existing.stage, toStage: item.stage, note: data.note || null } });
  let customer = null;
  if (data.convert || item.stage === "won") {
    customer = await prisma.customer.create({ data: { storeId: context.storeId, advisorId: item.advisorId, name: item.name, phone: item.phone, source: existing.sourceId ? "线索转化" : "未知", status: "active", postpartumProfile: { create: { storeId: context.storeId, stage: "待初评" } } } });
  }
  return json({ item, customer });
}

async function serviceItems() {
  const context = await requireContext();
  requirePermission(context, "services:view");
  return json({ items: await prisma.serviceItem.findMany({ where: { storeId: context.storeId }, orderBy: { createdAt: "desc" } }) });
}

async function createServiceItem(request: NextRequest) {
  const context = await requireContext();
  requirePermission(context, "services:write");
  const data = await body<{ name?: string; category?: string; durationMinutes?: number; priceCents?: number }>(request);
  return json({ item: await prisma.serviceItem.create({ data: { storeId: context.storeId, name: required(data.name, "项目名称"), category: data.category || "产后修复", durationMinutes: Number(data.durationMinutes || 60), priceCents: Number(data.priceCents || 0) } }) });
}

async function servicePackages() {
  const context = await requireContext();
  requirePermission(context, "services:view");
  return json({ items: await prisma.servicePackage.findMany({ where: { storeId: context.storeId }, include: { items: { include: { serviceItem: true } } }, orderBy: { createdAt: "desc" } }) });
}

async function createServicePackage(request: NextRequest) {
  const context = await requireContext();
  requirePermission(context, "services:write");
  const data = await body<{ name?: string; priceCents?: number; validityDays?: number; itemId?: string; quantity?: number }>(request);
  const item = await prisma.servicePackage.create({
    data: {
      storeId: context.storeId,
      name: required(data.name, "套餐名称"),
      priceCents: Number(data.priceCents || 0),
      validityDays: Number(data.validityDays || 180),
      items: data.itemId ? { create: { itemId: data.itemId, quantity: Number(data.quantity || 1) } } : undefined,
    },
  });
  return json({ item });
}

async function customerPackages() {
  const context = await requireContext();
  requirePermission(context, "services:view");
  return json({ items: await prisma.customerPackage.findMany({ where: { storeId: context.storeId }, include: { customer: true, package: true }, orderBy: { createdAt: "desc" } }) });
}

async function createCustomerPackage(request: NextRequest) {
  const context = await requireContext();
  requirePermission(context, "services:write");
  const data = await body<{ customerId?: string; packageId?: string; orderId?: string; totalSessions?: number }>(request);
  const pkg = await prisma.servicePackage.findFirst({ where: { id: required(data.packageId, "套餐"), storeId: context.storeId } });
  if (!pkg) throw new ApiError("套餐不存在", 404);
  const startDate = todayString();
  const total = Number(data.totalSessions || 10);
  const item = await prisma.customerPackage.create({ data: { storeId: context.storeId, customerId: required(data.customerId, "客户"), packageId: pkg.id, orderId: data.orderId || null, totalSessions: total, remainingSessions: total, startDate, expireDate: addDays(startDate, pkg.validityDays) } });
  return json({ item });
}

async function appointments(request: NextRequest) {
  const context = await requireContext();
  requirePermission(context, "schedule:view");
  const url = new URL(request.url);
  const date = url.searchParams.get("date") || undefined;
  const items = await prisma.appointment.findMany({ where: { storeId: context.storeId, ...(date ? { date } : {}) }, include: { customer: true, employee: true, serviceItem: true, room: true, equipment: true }, orderBy: [{ date: "asc" }, { startTime: "asc" }] });
  return json({ items });
}

async function scheduleResources() {
  const context = await requireContext();
  requirePermission(context, "schedule:view");
  const [employees, rooms, equipment, services, customers] = await Promise.all([
    prisma.employee.findMany({ where: { storeId: context.storeId, status: "active" } }),
    prisma.room.findMany({ where: { storeId: context.storeId, active: true } }),
    prisma.equipment.findMany({ where: { storeId: context.storeId, status: "available" } }),
    prisma.serviceItem.findMany({ where: { storeId: context.storeId, active: true } }),
    prisma.customer.findMany({ where: advisorWhere(context, { storeId: context.storeId }) }),
  ]);
  return json({ employees, rooms, equipment, services, customers });
}

async function createAppointment(request: NextRequest) {
  const context = await requireContext();
  requirePermission(context, "schedule:write");
  const data = await body<{ customerId?: string; employeeId?: string; serviceItemId?: string; roomId?: string; equipmentId?: string; date?: string; startTime?: string; endTime?: string; notes?: string }>(request);
  const storeId = context.storeId;
  const date = required(data.date, "日期");
  const startTime = required(data.startTime, "开始时间");
  const endTime = required(data.endTime, "结束时间");
  await assertNoScheduleConflict(storeId, required(data.employeeId, "员工"), data.roomId || null, data.equipmentId || null, date, startTime, endTime);
  const item = await prisma.appointment.create({ data: { storeId, customerId: required(data.customerId, "客户"), employeeId: data.employeeId!, serviceItemId: required(data.serviceItemId, "项目"), roomId: data.roomId || null, equipmentId: data.equipmentId || null, date, startTime, endTime, notes: data.notes || null } });
  return json({ item });
}

async function completeService(request: NextRequest) {
  const context = await requireContext();
  requirePermission(context, "services:consume");
  const data = await body<{ appointmentId?: string; customerPackageId?: string; result?: string; feedback?: string }>(request);
  const appointment = await prisma.appointment.findFirst({ where: { id: required(data.appointmentId, "预约"), storeId: context.storeId } });
  if (!appointment) throw new ApiError("预约不存在", 404);
  if (data.customerPackageId) {
    const customerPackage = await prisma.customerPackage.findFirst({ where: { id: data.customerPackageId, storeId: context.storeId } });
    if (!customerPackage || customerPackage.remainingSessions <= 0) throw new ApiError("客户套餐剩余次数不足", 400);
  }
  const item = await prisma.$transaction(async (tx) => {
    const record = await tx.serviceRecord.create({ data: { storeId: context.storeId, appointmentId: appointment.id, customerPackageId: data.customerPackageId || null, serviceItemId: appointment.serviceItemId, employeeId: appointment.employeeId, createdById: context.user.id, result: data.result || "服务完成", customerFeedback: data.feedback || null } });
    await tx.appointment.update({ where: { id: appointment.id }, data: { status: "completed" } });
    if (data.customerPackageId) await tx.customerPackage.update({ where: { id: data.customerPackageId }, data: { remainingSessions: { decrement: 1 } } });
    return record;
  });
  return json({ item });
}

async function orders() {
  const context = await requireContext();
  requirePermission(context, "finance:view");
  return json({ items: await prisma.order.findMany({ where: { storeId: context.storeId }, include: { customer: true, package: true, payments: true, refunds: true }, orderBy: { createdAt: "desc" } }) });
}

async function createOrder(request: NextRequest) {
  const context = await requireContext();
  requirePermission(context, "finance:write");
  const data = await body<{ customerId?: string; packageId?: string; amountCents?: number; type?: string }>(request);
  const item = await prisma.order.create({ data: { storeId: context.storeId, customerId: required(data.customerId, "客户"), packageId: data.packageId || null, orderNo: `PK${Date.now()}`, type: data.type || "package", amountCents: Number(data.amountCents || 0) } });
  return json({ item });
}

async function createPayment(orderId: string, request: NextRequest) {
  const context = await requireContext();
  requirePermission(context, "finance:write");
  const order = await prisma.order.findFirst({ where: { id: orderId, storeId: context.storeId } });
  if (!order) throw new ApiError("订单不存在", 404);
  const data = await body<{ amountCents?: number; method?: string; note?: string }>(request);
  const amount = Number(data.amountCents || 0);
  const item = await prisma.$transaction(async (tx) => {
    const payment = await tx.payment.create({ data: { storeId: context.storeId, orderId, amountCents: amount, method: data.method || "微信", note: data.note || null } });
    const paidCents = order.paidCents + amount;
    await tx.order.update({ where: { id: orderId }, data: { paidCents, status: paidCents >= order.amountCents ? "paid" : "partial" } });
    return payment;
  });
  return json({ item });
}

async function createRefund(orderId: string, request: NextRequest) {
  const context = await requireContext();
  requirePermission(context, "finance:refund");
  const data = await body<{ amountCents?: number; reason?: string }>(request);
  return json({ item: await prisma.refundRequest.create({ data: { storeId: context.storeId, orderId, amountCents: Number(data.amountCents || 0), reason: data.reason || "客户申请退款" } }) });
}

async function products() {
  const context = await requireContext();
  requirePermission(context, "inventory:view");
  return json({ items: await prisma.product.findMany({ where: { storeId: context.storeId }, include: { stock: true }, orderBy: { createdAt: "desc" } }) });
}

async function createProduct(request: NextRequest) {
  const context = await requireContext();
  requirePermission(context, "inventory:write");
  const data = await body<{ name?: string; category?: string; unit?: string; quantity?: number; lowStockQty?: number }>(request);
  const item = await prisma.product.create({ data: { storeId: context.storeId, name: required(data.name, "产品名称"), category: data.category || "耗材", unit: data.unit || "件", lowStockQty: Number(data.lowStockQty || 10), stock: { create: { storeId: context.storeId, quantity: Number(data.quantity || 0) } } } });
  return json({ item });
}

async function notifications() {
  const context = await requireContext();
  return json({ items: await prisma.notification.findMany({ where: { storeId: context.storeId, userId: context.user.id }, orderBy: { createdAt: "desc" } }) });
}

async function campaigns() {
  const context = await requireContext();
  requirePermission(context, "marketing:view");
  return json({ items: await prisma.campaign.findMany({ where: { storeId: context.storeId }, orderBy: { createdAt: "desc" } }) });
}

function advisorWhere(context: Awaited<ReturnType<typeof requireContext>>, base: Record<string, unknown>) {
  if (context.membership.dataScope === "own") return { ...base, advisorId: context.user.id };
  return base;
}

async function assertNoScheduleConflict(storeId: string, employeeId: string, roomId: string | null, equipmentId: string | null, date: string, startTime: string, endTime: string) {
  const existing = await prisma.appointment.findMany({ where: { storeId, date, status: { in: ["booked", "arrived"] }, OR: [{ employeeId }, ...(roomId ? [{ roomId }] : []), ...(equipmentId ? [{ equipmentId }] : [])] } });
  if (existing.some((item) => overlaps(startTime, endTime, item.startTime, item.endTime))) throw new ApiError("该员工、房间或设备在该时段已被占用");
}

function required(value: unknown, label: string) {
  const text = String(value || "").trim();
  if (!text) throw new ApiError(`请填写${label}`);
  return text;
}

async function log(storeId: string, userId: string | undefined, action: string, entity: string, entityId?: string) {
  await prisma.auditLog.create({ data: { storeId, userId, action, entity, entityId } }).catch(() => undefined);
}

export async function GET(request: NextRequest, params: Params) {
  return run(request, params, "GET");
}

export async function POST(request: NextRequest, params: Params) {
  return run(request, params, "POST");
}

export async function PUT(request: NextRequest, params: Params) {
  return run(request, params, "PUT");
}

export async function DELETE(request: NextRequest, params: Params) {
  return run(request, params, "DELETE");
}

async function run(request: NextRequest, params: Params, method: string) {
  try {
    return await handler(request, params, method);
  } catch (error) {
    const apiError = error instanceof ApiError ? error : new ApiError("服务器错误", 500);
    if (!(error instanceof ApiError)) console.error(error);
    return json({ error: apiError.message }, apiError.status);
  }
}
