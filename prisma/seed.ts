import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/password";
import { addDays, todayString } from "../src/lib/time";

const prisma = new PrismaClient();

const permissions = [
  ["*", "全部权限", "system"],
  ["reports:view", "查看报表", "reports"],
  ["customers:view", "查看客户", "customers"],
  ["customers:write", "维护客户", "customers"],
  ["leads:view", "查看线索", "leads"],
  ["leads:write", "维护线索", "leads"],
  ["services:view", "查看服务", "services"],
  ["services:write", "维护服务", "services"],
  ["services:consume", "服务消课", "services"],
  ["schedule:view", "查看排班", "schedule"],
  ["schedule:write", "维护预约", "schedule"],
  ["finance:view", "查看财务", "finance"],
  ["finance:write", "维护财务", "finance"],
  ["finance:refund", "退款审批", "finance"],
  ["inventory:view", "查看库存", "inventory"],
  ["inventory:write", "维护库存", "inventory"],
  ["marketing:view", "查看营销", "marketing"],
  ["admin:employees", "员工管理", "admin"],
  ["admin:roles", "权限管理", "admin"],
  ["admin:audit", "操作日志", "admin"],
];

const rolePermissionMap: Record<string, string[]> = {
  hq_admin: ["*"],
  store_manager: permissions.map(([code]) => code).filter((code) => code !== "*"),
  advisor: ["reports:view", "customers:view", "customers:write", "leads:view", "leads:write", "services:view", "schedule:view", "schedule:write", "finance:view"],
  therapist: ["customers:view", "services:view", "services:consume", "schedule:view"],
  finance: ["reports:view", "finance:view", "finance:write", "finance:refund"],
  customer_service: ["customers:view", "customers:write", "leads:view", "leads:write", "schedule:view"],
};

async function main() {
  await prisma.notification.deleteMany();
  await prisma.careReminder.deleteMany();
  await prisma.campaign.deleteMany();
  await prisma.stockMovement.deleteMany();
  await prisma.stockItem.deleteMany();
  await prisma.product.deleteMany();
  await prisma.expense.deleteMany();
  await prisma.refundRequest.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.serviceRecord.deleteMany();
  await prisma.appointment.deleteMany();
  await prisma.customerPackage.deleteMany();
  await prisma.order.deleteMany();
  await prisma.packageItem.deleteMany();
  await prisma.servicePackage.deleteMany();
  await prisma.serviceItem.deleteMany();
  await prisma.scheduleBlock.deleteMany();
  await prisma.equipment.deleteMany();
  await prisma.room.deleteMany();
  await prisma.leadStageHistory.deleteMany();
  await prisma.lead.deleteMany();
  await prisma.leadSource.deleteMany();
  await prisma.followUpRecord.deleteMany();
  await prisma.customerTag.deleteMany();
  await prisma.postpartumProfile.deleteMany();
  await prisma.babyProfile.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.leaveRequest.deleteMany();
  await prisma.workShift.deleteMany();
  await prisma.employee.deleteMany();
  await prisma.position.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.storeMembership.deleteMany();
  await prisma.rolePermission.deleteMany();
  await prisma.permission.deleteMany();
  await prisma.role.deleteMany();
  await prisma.user.deleteMany();
  await prisma.store.deleteMany();

  const store = await prisma.store.create({
    data: {
      name: "悦生产康中心·滨江店",
      code: "BJ001",
      city: "杭州",
      address: "滨江区江南大道 1888 号",
      managerName: "林店长",
      phone: "0571-88886666",
    },
  });

  const secondStore = await prisma.store.create({
    data: {
      name: "悦生产康中心·城西店",
      code: "CX001",
      city: "杭州",
      address: "西湖区文三路 99 号",
      managerName: "周店长",
      phone: "0571-88990011",
    },
  });

  const permissionRows: Record<string, { id: string }> = {};
  for (const [code, name, category] of permissions) {
    permissionRows[code] = await prisma.permission.create({ data: { code, name, category, description: name } });
  }

  const roles = {
    hq_admin: await prisma.role.create({ data: { code: "hq_admin", name: "总部管理员", description: "可管理多个门店和全部模块", level: 100 } }),
    store_manager: await prisma.role.create({ data: { code: "store_manager", name: "店长", description: "管理本门店经营和人员", level: 80 } }),
    advisor: await prisma.role.create({ data: { code: "advisor", name: "顾问", description: "负责线索、客户和预约成交", level: 50 } }),
    therapist: await prisma.role.create({ data: { code: "therapist", name: "产康师", description: "查看排班并完成服务消课", level: 40 } }),
    finance: await prisma.role.create({ data: { code: "finance", name: "财务", description: "维护收款、退款和支出", level: 60 } }),
    customer_service: await prisma.role.create({ data: { code: "customer_service", name: "客服", description: "负责客户关怀和跟进", level: 45 } }),
  };

  for (const [roleCode, codes] of Object.entries(rolePermissionMap)) {
    for (const code of codes) {
      await prisma.rolePermission.create({ data: { roleId: roles[roleCode as keyof typeof roles].id, permissionId: permissionRows[code].id } });
    }
  }

  const passwordHash = hashPassword("Admin123456");
  const admin = await user("总部管理员", "admin@demo.local", "13800000000", passwordHash);
  const manager = await user("林店长", "manager@demo.local", "13800000001", passwordHash);
  const advisor = await user("陈顾问", "advisor@demo.local", "13800000002", passwordHash);
  const therapistUser = await user("许产康师", "therapist@demo.local", "13800000003", passwordHash);
  const finance = await user("吴财务", "finance@demo.local", "13800000004", passwordHash);

  await prisma.storeMembership.createMany({
    data: [
      { userId: admin.id, storeId: store.id, roleId: roles.hq_admin.id, dataScope: "all" },
      { userId: admin.id, storeId: secondStore.id, roleId: roles.hq_admin.id, dataScope: "all" },
      { userId: manager.id, storeId: store.id, roleId: roles.store_manager.id, dataScope: "store" },
      { userId: advisor.id, storeId: store.id, roleId: roles.advisor.id, dataScope: "own" },
      { userId: therapistUser.id, storeId: store.id, roleId: roles.therapist.id, dataScope: "own" },
      { userId: finance.id, storeId: store.id, roleId: roles.finance.id, dataScope: "store" },
    ],
  });

  const positions = await Promise.all([
    prisma.position.create({ data: { storeId: store.id, name: "店长", category: "management" } }),
    prisma.position.create({ data: { storeId: store.id, name: "产康顾问", category: "sales" } }),
    prisma.position.create({ data: { storeId: store.id, name: "产康师", category: "service" } }),
    prisma.position.create({ data: { storeId: store.id, name: "财务", category: "finance" } }),
  ]);

  const employees = await Promise.all([
    employee(store.id, manager.id, positions[0].id, "林店长", "13800000001", "manager", 0.03),
    employee(store.id, advisor.id, positions[1].id, "陈顾问", "13800000002", "advisor", 0.05),
    employee(store.id, therapistUser.id, positions[2].id, "许产康师", "13800000003", "therapist", 0.08),
    employee(store.id, null, positions[2].id, "王产康师", "13800000005", "therapist", 0.08),
    employee(store.id, null, positions[2].id, "赵护理师", "13800000006", "nurse", 0.06),
    employee(store.id, null, positions[1].id, "孙顾问", "13800000007", "advisor", 0.05),
    employee(store.id, finance.id, positions[3].id, "吴财务", "13800000004", "finance", 0),
    employee(store.id, null, positions[2].id, "周产康师", "13800000008", "therapist", 0.08),
    employee(store.id, null, positions[2].id, "郑理疗师", "13800000009", "therapist", 0.08),
    employee(store.id, null, positions[1].id, "刘客服", "13800000010", "customer_service", 0.02),
  ]);

  const rooms = await Promise.all(["产康一室", "产康二室", "通乳护理室", "评估室"].map((name) => prisma.room.create({ data: { storeId: store.id, name, type: name.includes("评估") ? "assessment" : "service" } })));
  const equipments = await Promise.all(["盆底肌修复仪", "腹直肌修复仪", "满月汗设备"].map((name) => prisma.equipment.create({ data: { storeId: store.id, name, type: "产康仪器" } })));

  const items = await Promise.all([
    serviceItem(store.id, "盆底肌修复", "产后修复", 60, 68000),
    serviceItem(store.id, "腹直肌修复", "产后修复", 60, 58000),
    serviceItem(store.id, "通乳护理", "乳腺护理", 90, 88000),
    serviceItem(store.id, "满月汗", "调理", 90, 52000),
  ]);

  const packageA = await prisma.servicePackage.create({
    data: {
      storeId: store.id,
      name: "产后黄金恢复 10 次卡",
      priceCents: 498000,
      validityDays: 180,
      items: { create: [{ itemId: items[0].id, quantity: 4 }, { itemId: items[1].id, quantity: 4 }, { itemId: items[2].id, quantity: 2 }] },
    },
  });

  const packageB = await prisma.servicePackage.create({
    data: {
      storeId: store.id,
      name: "通乳护理 5 次卡",
      priceCents: 298000,
      validityDays: 90,
      items: { create: [{ itemId: items[2].id, quantity: 5 }] },
    },
  });

  const sources = await Promise.all(["小红书", "老带新", "自然到店", "月子中心合作"].map((name) => prisma.leadSource.create({ data: { storeId: store.id, name } })));

  for (let i = 1; i <= 12; i++) {
    const lead = await prisma.lead.create({
      data: {
        storeId: store.id,
        sourceId: sources[i % sources.length].id,
        advisorId: advisor.id,
        name: `线索客户${i}`,
        phone: `1391000${String(i).padStart(4, "0")}`,
        stage: ["new", "invited", "visited", "trial", "lost"][i % 5],
        intentLevel: ["high", "medium", "low"][i % 3],
        dueDate: addDays(todayString(), i % 7),
        notes: "种子线索，用于转化漏斗演示",
      },
    });
    await prisma.leadStageHistory.create({ data: { storeId: store.id, leadId: lead.id, toStage: lead.stage, note: "初始化阶段" } });
  }

  const customers = [];
  for (let i = 1; i <= 30; i++) {
    const customer = await prisma.customer.create({
      data: {
        storeId: store.id,
        advisorId: advisor.id,
        name: `产康客户${i}`,
        phone: `1382000${String(i).padStart(4, "0")}`,
        source: sources[i % sources.length].name,
        productionDate: addDays(todayString(), -20 - i),
        productionType: i % 2 === 0 ? "顺产" : "剖宫产",
        notes: i % 4 === 0 ? "重点复购客户" : null,
        babies: { create: { storeId: store.id, name: `宝宝${i}`, gender: i % 2 === 0 ? "女" : "男", birthday: addDays(todayString(), -20 - i), feeding: i % 3 === 0 ? "母乳" : "混合喂养", weightKg: 3 + (i % 4) * 0.2 } },
        postpartumProfile: { create: { storeId: store.id, stage: i % 3 === 0 ? "产后 42 天复查" : "恢复期", diastasisCm: 1 + (i % 4) * 0.5, pelvicFloor: i % 2 === 0 ? "需训练" : "良好", lactation: i % 5 === 0 ? "堵奶风险" : "正常" } },
        tags: { create: [{ storeId: store.id, name: i % 2 === 0 ? "高意向" : "待复购", color: i % 2 === 0 ? "#176b5f" : "#b86b29" }] },
      },
    });
    customers.push(customer);
    await prisma.followUpRecord.create({ data: { storeId: store.id, customerId: customer.id, createdById: advisor.id, channel: "微信", content: "已沟通产后恢复需求，预约到店评估", nextAction: "提醒到店", nextDate: addDays(todayString(), i % 6) } });
    await prisma.careReminder.create({ data: { storeId: store.id, customerId: customer.id, title: "产后阶段关怀", dueDate: addDays(todayString(), i % 10) } });
  }

  for (let i = 0; i < 10; i++) {
    const pkg = i % 2 === 0 ? packageA : packageB;
    const order = await prisma.order.create({
      data: { storeId: store.id, customerId: customers[i].id, packageId: pkg.id, orderNo: `PK202605${String(i + 1).padStart(4, "0")}`, type: "package", amountCents: pkg.priceCents, paidCents: pkg.priceCents, status: "paid" },
    });
    await prisma.payment.create({ data: { storeId: store.id, orderId: order.id, method: i % 2 === 0 ? "微信" : "支付宝", amountCents: pkg.priceCents } });
    await prisma.customerPackage.create({ data: { storeId: store.id, customerId: customers[i].id, packageId: pkg.id, orderId: order.id, totalSessions: i % 2 === 0 ? 10 : 5, remainingSessions: i % 2 === 0 ? 8 : 4, startDate: todayString(), expireDate: addDays(todayString(), pkg.validityDays) } });
  }

  for (let i = 0; i < 8; i++) {
    await prisma.appointment.create({
      data: {
        storeId: store.id,
        customerId: customers[i].id,
        employeeId: employees[2 + (i % 3)].id,
        serviceItemId: items[i % items.length].id,
        roomId: rooms[i % rooms.length].id,
        equipmentId: i % 2 === 0 ? equipments[i % equipments.length].id : null,
        date: addDays(todayString(), i % 4),
        startTime: `${9 + i}:00`.padStart(5, "0"),
        endTime: `${10 + i}:00`.padStart(5, "0"),
        notes: "种子预约",
      },
    });
  }

  await Promise.all([
    prisma.product.create({ data: { storeId: store.id, name: "一次性护理垫", category: "耗材", unit: "包", lowStockQty: 20, stock: { create: { storeId: store.id, quantity: 16 } }, movements: { create: { storeId: store.id, type: "in", quantity: 80, reason: "初始入库" } } } }),
    prisma.product.create({ data: { storeId: store.id, name: "产康精油", category: "产品", unit: "瓶", lowStockQty: 10, stock: { create: { storeId: store.id, quantity: 24 } }, movements: { create: { storeId: store.id, type: "in", quantity: 24, reason: "初始入库" } } } }),
  ]);

  await prisma.campaign.create({ data: { storeId: store.id, name: "满月修复体验活动", type: "体验价", startDate: todayString(), endDate: addDays(todayString(), 30), status: "active", description: "新客首次到店体验价活动" } });
  await prisma.expense.createMany({ data: [{ storeId: store.id, category: "房租", amountCents: 2600000, occurredAt: todayString(), vendor: "物业" }, { storeId: store.id, category: "广告投放", amountCents: 680000, occurredAt: todayString(), vendor: "小红书" }] });
  await prisma.notification.create({ data: { storeId: store.id, userId: manager.id, title: "今日预约提醒", content: "今日有多位客户预约产康服务，请关注排班冲突。" } });
  await prisma.auditLog.create({ data: { storeId: store.id, userId: admin.id, action: "seed.init", entity: "System", detail: "初始化一期演示数据" } });

  console.log("Seed complete");
  console.log("总部账号：admin@demo.local / Admin123456");
  console.log("店长账号：manager@demo.local / Admin123456");
  console.log("顾问账号：advisor@demo.local / Admin123456");
}

async function user(name: string, email: string, phone: string, passwordHash: string) {
  return prisma.user.create({ data: { name, email, phone, passwordHash } });
}

async function employee(storeId: string, userId: string | null, positionId: string, name: string, phone: string, roleType: string, commissionRate: number) {
  return prisma.employee.create({ data: { storeId, userId, positionId, name, phone, roleType, commissionRate, hireDate: new Date() } });
}

async function serviceItem(storeId: string, name: string, category: string, durationMinutes: number, priceCents: number) {
  return prisma.serviceItem.create({ data: { storeId, name, category, durationMinutes, priceCents } });
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
