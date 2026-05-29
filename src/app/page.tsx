"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { formatMoney } from "@/lib/time";

type Context = {
  user: null | { id: string; name: string; email: string };
  currentStoreId?: string;
  stores?: { id: string; name: string; city: string; role: string; roleCode: string; dataScope: string }[];
  permissions?: string[];
};

type Dashboard = {
  metrics: {
    appointmentsToday: number;
    revenueCents: number;
    customersCount: number;
    leadsPending: number;
    packagesDue: number;
    pendingRefunds: number;
    lowStockCount: number;
  };
};

type ApiList<T> = { items: T[] };
type Customer = { id: string; name: string; phone: string; source: string; productionType?: string; advisor?: { name: string }; tags: { name: string; color: string }[]; packages: { remainingSessions: number; package: { name: string } }[] };
type Lead = { id: string; name: string; phone: string; stage: string; intentLevel: string; source?: { name: string }; advisor?: { name: string } };
type Employee = { id: string; name: string; phone: string; roleType: string; position?: { name: string }; commissionRate: number };
type ServiceItem = { id: string; name: string; category: string; durationMinutes: number; priceCents: number };
type ServicePackage = { id: string; name: string; priceCents: number; validityDays: number; items: { quantity: number; serviceItem: ServiceItem }[] };
type Appointment = { id: string; date: string; startTime: string; endTime: string; status: string; customer: { name: string }; employee: { name: string }; serviceItem: { name: string }; room?: { name: string } };
type Order = { id: string; orderNo: string; amountCents: number; paidCents: number; status: string; customer: { name: string }; package?: { name: string }; payments: unknown[]; refunds: { status: string }[] };
type Product = { id: string; name: string; category: string; unit: string; lowStockQty: number; stock?: { quantity: number } };

const modules = [
  ["dashboard", "综合看板"],
  ["customers", "客户管理"],
  ["leads", "线索管理"],
  ["services", "服务套餐"],
  ["schedule", "预约排班"],
  ["employees", "员工管理"],
  ["finance", "财务框架"],
  ["inventory", "库存耗材"],
  ["marketing", "营销提醒"],
  ["admin", "权限审计"],
] as const;

const stageLabels: Record<string, string> = { new: "新线索", invited: "已邀约", visited: "已到店", trial: "已体验", won: "已成交", lost: "已流失" };
const roleLabels: Record<string, string> = { manager: "店长", advisor: "顾问", therapist: "产康师", nurse: "护理师", finance: "财务", customer_service: "客服" };

async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...options, headers: { "Content-Type": "application/json", ...(options?.headers || {}) } });
  const data = await response.json();
  if (!response.ok || data.error) throw new Error(data.error || "请求失败");
  return data;
}

export default function Home() {
  const [context, setContext] = useState<Context>({ user: null });
  const [tab, setTab] = useState<(typeof modules)[number][0]>("dashboard");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  async function loadMe() {
    const data = await api<Context>("/api/auth/me");
    setContext(data);
    setLoading(false);
  }

  useEffect(() => {
    loadMe().catch(() => setLoading(false));
  }, []);

  if (loading) return <main className="center">正在加载平台...</main>;
  if (!context.user) return <LoginPanel onDone={loadMe} setMessage={setMessage} message={message} />;

  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span>悦生</span>
          <strong>产康 SaaS</strong>
        </div>
        <nav>
          {modules.map(([key, label]) => (
            <button key={key} className={tab === key ? "active" : ""} onClick={() => setTab(key)}>
              {label}
            </button>
          ))}
        </nav>
      </aside>
      <section className="workspace">
        <header className="topbar">
          <div>
            <p>{context.stores?.find((item) => item.id === context.currentStoreId)?.name}</p>
            <h1>{modules.find(([key]) => key === tab)?.[1]}</h1>
          </div>
          <div className="top-actions">
            <input placeholder="搜索客户、手机号、订单号" />
            <select value={context.currentStoreId} onChange={async (event) => { await api("/api/auth/switch-store", { method: "POST", body: JSON.stringify({ storeId: event.target.value }) }); await loadMe(); }}>
              {context.stores?.map((store) => <option key={store.id} value={store.id}>{store.name} / {store.role}</option>)}
            </select>
            <button onClick={async () => { await api("/api/auth/logout", { method: "POST" }); setContext({ user: null }); }}>退出</button>
          </div>
        </header>
        {message && <div className="toast" onClick={() => setMessage("")}>{message}</div>}
        <ModuleView tab={tab} setMessage={setMessage} />
      </section>
    </main>
  );
}

function LoginPanel({ onDone, setMessage, message }: { onDone: () => void; setMessage: (value: string) => void; message: string }) {
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget).entries());
    try {
      await api("/api/auth/login", { method: "POST", body: JSON.stringify(data) });
      await onDone();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "登录失败");
    }
  }

  return (
    <main className="login">
      <form onSubmit={submit}>
        <div className="brand large"><span>悦生</span><strong>产康 SaaS</strong></div>
        <h1>门店经营管理平台</h1>
        <input name="email" defaultValue="admin@demo.local" placeholder="邮箱" required />
        <input name="password" type="password" defaultValue="Admin123456" placeholder="密码" required />
        <button>登录平台</button>
        {message && <p className="error">{message}</p>}
        <p className="hint">可用账号：admin / manager / advisor @demo.local，密码 Admin123456</p>
      </form>
    </main>
  );
}

function ModuleView({ tab, setMessage }: { tab: string; setMessage: (value: string) => void }) {
  if (tab === "dashboard") return <DashboardPanel />;
  if (tab === "customers") return <CustomersPanel setMessage={setMessage} />;
  if (tab === "leads") return <LeadsPanel setMessage={setMessage} />;
  if (tab === "services") return <ServicesPanel setMessage={setMessage} />;
  if (tab === "schedule") return <SchedulePanel setMessage={setMessage} />;
  if (tab === "employees") return <EmployeesPanel setMessage={setMessage} />;
  if (tab === "finance") return <FinancePanel setMessage={setMessage} />;
  if (tab === "inventory") return <InventoryPanel setMessage={setMessage} />;
  if (tab === "marketing") return <MarketingPanel />;
  return <AdminPanel />;
}

function DashboardPanel() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [conversion, setConversion] = useState<{ stages: { stage: string; _count: { id: number } }[] } | null>(null);

  useEffect(() => {
    api<Dashboard>("/api/reports/dashboard").then(setData);
    api<{ stages: { stage: string; _count: { id: number } }[] }>("/api/reports/conversion").then(setConversion);
  }, []);

  if (!data) return <Empty text="正在加载看板..." />;
  const cards = [
    ["今日预约", data.metrics.appointmentsToday],
    ["累计营收", formatMoney(data.metrics.revenueCents)],
    ["客户总数", data.metrics.customersCount],
    ["待跟进线索", data.metrics.leadsPending],
    ["有效套餐", data.metrics.packagesDue],
    ["待审退款", data.metrics.pendingRefunds],
    ["低库存预警", data.metrics.lowStockCount],
  ];
  return (
    <div className="grid">
      {cards.map(([label, value]) => <article className="metric" key={label}><span>{label}</span><strong>{value}</strong></article>)}
      <section className="panel wide">
        <h2>客户转化漏斗</h2>
        <div className="funnel">
          {conversion?.stages.map((item) => <div key={item.stage}><span>{stageLabels[item.stage] || item.stage}</span><b style={{ width: `${Math.max(8, item._count.id * 12)}%` }}>{item._count.id}</b></div>)}
        </div>
      </section>
    </div>
  );
}

function CustomersPanel({ setMessage }: { setMessage: (value: string) => void }) {
  const [items, setItems] = useState<Customer[]>([]);
  const load = () => api<ApiList<Customer>>("/api/customers").then((data) => setItems(data.items));
  useEffect(() => { load(); }, []);
  return (
    <TwoColumn
      title="新增客户"
      form={<QuickForm fields={[["name", "客户姓名"], ["phone", "手机号"], ["source", "来源"], ["productionDate", "生产日期"], ["productionType", "生产方式"], ["babyName", "宝宝昵称"]]} submitText="保存客户" onSubmit="/api/customers" onDone={load} setMessage={setMessage} />}
    >
      <DataTable headers={["客户", "来源", "生产", "顾问", "标签", "套餐"]} rows={items.map((item) => [item.name + "\n" + item.phone, item.source, item.productionType || "-", item.advisor?.name || "-", item.tags.map((tag) => tag.name).join("、"), item.packages.map((pkg) => `${pkg.package.name} 剩${pkg.remainingSessions}`).join("、") || "-"])} />
    </TwoColumn>
  );
}

function LeadsPanel({ setMessage }: { setMessage: (value: string) => void }) {
  const [items, setItems] = useState<Lead[]>([]);
  const load = () => api<ApiList<Lead>>("/api/leads").then((data) => setItems(data.items));
  useEffect(() => { load(); }, []);
  async function win(id: string) {
    await api(`/api/leads/${id}/stage`, { method: "PUT", body: JSON.stringify({ stage: "won", convert: true, note: "成交转客户" }) });
    setMessage("线索已成交并转为客户");
    load();
  }
  return (
    <TwoColumn title="新增线索" form={<QuickForm fields={[["name", "线索姓名"], ["phone", "手机号"], ["sourceName", "来源"], ["intentLevel", "意向等级"], ["notes", "备注"]]} submitText="保存线索" onSubmit="/api/leads" onDone={load} setMessage={setMessage} />}>
      <div className="cards">
        {items.map((item) => <article key={item.id} className="record"><strong>{item.name}</strong><span>{item.phone} / {item.source?.name || "未知来源"}</span><span>{stageLabels[item.stage] || item.stage} / {item.intentLevel}</span><button onClick={() => win(item.id)}>成交转客户</button></article>)}
      </div>
    </TwoColumn>
  );
}

function ServicesPanel({ setMessage }: { setMessage: (value: string) => void }) {
  const [items, setItems] = useState<ServiceItem[]>([]);
  const [packages, setPackages] = useState<ServicePackage[]>([]);
  const load = () => Promise.all([api<ApiList<ServiceItem>>("/api/services/items").then((data) => setItems(data.items)), api<ApiList<ServicePackage>>("/api/services/packages").then((data) => setPackages(data.items))]);
  useEffect(() => { load(); }, []);
  return (
    <div className="grid two">
      <TwoColumn title="新增服务项目" form={<QuickForm fields={[["name", "项目名称"], ["category", "分类"], ["durationMinutes", "服务分钟数"], ["priceCents", "价格(分)"]]} submitText="保存项目" onSubmit="/api/services/items" onDone={load} setMessage={setMessage} />}>
        <DataTable headers={["项目", "分类", "时长", "价格"]} rows={items.map((item) => [item.name, item.category, `${item.durationMinutes} 分钟`, formatMoney(item.priceCents)])} />
      </TwoColumn>
      <section className="panel">
        <h2>套餐框架</h2>
        <div className="cards">{packages.map((pkg) => <article className="record" key={pkg.id}><strong>{pkg.name}</strong><span>{formatMoney(pkg.priceCents)} / 有效 {pkg.validityDays} 天</span><span>{pkg.items.map((item) => `${item.serviceItem.name} x${item.quantity}`).join("、")}</span></article>)}</div>
      </section>
    </div>
  );
}

function SchedulePanel({ setMessage }: { setMessage: (value: string) => void }) {
  const [items, setItems] = useState<Appointment[]>([]);
  const [resources, setResources] = useState<{ employees: Employee[]; services: ServiceItem[]; customers: Customer[]; rooms: { id: string; name: string }[]; equipment: { id: string; name: string }[] } | null>(null);
  const load = () => Promise.all([api<ApiList<Appointment>>("/api/schedule/appointments").then((data) => setItems(data.items)), api<typeof resources>("/api/schedule/resources").then(setResources)]);
  useEffect(() => { load(); }, []);
  return (
    <TwoColumn
      title="创建预约"
      form={<AppointmentForm resources={resources} onDone={load} setMessage={setMessage} />}
    >
      <DataTable headers={["日期", "时间", "客户", "项目", "服务人员", "房间", "状态"]} rows={items.map((item) => [item.date, `${item.startTime}-${item.endTime}`, item.customer.name, item.serviceItem.name, item.employee.name, item.room?.name || "-", item.status])} />
    </TwoColumn>
  );
}

function EmployeesPanel({ setMessage }: { setMessage: (value: string) => void }) {
  const [items, setItems] = useState<Employee[]>([]);
  const load = () => api<ApiList<Employee>>("/api/admin/employees").then((data) => setItems(data.items));
  useEffect(() => { load(); }, []);
  return (
    <TwoColumn title="新增员工" form={<QuickForm fields={[["name", "姓名"], ["phone", "手机号"], ["roleType", "岗位类型"], ["positionName", "岗位名称"]]} submitText="保存员工" onSubmit="/api/admin/employees" onDone={load} setMessage={setMessage} />}>
      <DataTable headers={["姓名", "手机号", "岗位", "角色", "提成"]} rows={items.map((item) => [item.name, item.phone, item.position?.name || "-", roleLabels[item.roleType] || item.roleType, `${Math.round(item.commissionRate * 100)}%`])} />
    </TwoColumn>
  );
}

function FinancePanel({ setMessage }: { setMessage: (value: string) => void }) {
  const [items, setItems] = useState<Order[]>([]);
  const load = () => api<ApiList<Order>>("/api/orders").then((data) => setItems(data.items));
  useEffect(() => { load(); }, []);
  return (
    <section className="panel">
      <h2>订单与收退款</h2>
      <DataTable headers={["订单号", "客户", "套餐", "应收", "已收", "状态", "退款"]} rows={items.map((item) => [item.orderNo, item.customer.name, item.package?.name || "-", formatMoney(item.amountCents), formatMoney(item.paidCents), item.status, item.refunds.map((refund) => refund.status).join("、") || "-"])} />
      <p className="hint">一期已提供订单、收款和退款申请 API，真实支付、发票和对账在后续接入。</p>
      <button onClick={() => setMessage("财务框架已就绪：订单、收款、退款申请、支出记录。")}>查看框架说明</button>
    </section>
  );
}

function InventoryPanel({ setMessage }: { setMessage: (value: string) => void }) {
  const [items, setItems] = useState<Product[]>([]);
  const load = () => api<ApiList<Product>>("/api/inventory/products").then((data) => setItems(data.items));
  useEffect(() => { load(); }, []);
  return (
    <TwoColumn title="新增耗材/产品" form={<QuickForm fields={[["name", "名称"], ["category", "分类"], ["unit", "单位"], ["quantity", "初始库存"], ["lowStockQty", "预警库存"]]} submitText="保存库存" onSubmit="/api/inventory/products" onDone={load} setMessage={setMessage} />}>
      <DataTable headers={["名称", "分类", "库存", "预警"]} rows={items.map((item) => [item.name, item.category, `${item.stock?.quantity || 0} ${item.unit}`, item.lowStockQty])} />
    </TwoColumn>
  );
}

function MarketingPanel() {
  const [items, setItems] = useState<{ id: string; name: string; type: string; startDate: string; endDate: string; status: string; description?: string }[]>([]);
  useEffect(() => { api<ApiList<(typeof items)[number]>>("/api/marketing/campaigns").then((data) => setItems(data.items)); }, []);
  return <section className="panel"><h2>营销活动与客户关怀</h2><div className="cards">{items.map((item) => <article className="record" key={item.id}><strong>{item.name}</strong><span>{item.type} / {item.status}</span><span>{item.startDate} 至 {item.endDate}</span><p>{item.description}</p></article>)}</div></section>;
}

function AdminPanel() {
  const [roles, setRoles] = useState<{ id: string; name: string; code: string; permissions: { permission: { name: string } }[] }[]>([]);
  const [logs, setLogs] = useState<{ id: string; action: string; entity: string; createdAt: string; user?: { name: string } }[]>([]);
  useEffect(() => {
    api<ApiList<(typeof roles)[number]>>("/api/admin/roles").then((data) => setRoles(data.items));
    api<ApiList<(typeof logs)[number]>>("/api/admin/audit-logs").then((data) => setLogs(data.items));
  }, []);
  return (
    <div className="grid two">
      <section className="panel"><h2>角色权限</h2><div className="cards">{roles.map((role) => <article className="record" key={role.id}><strong>{role.name}</strong><span>{role.code}</span><p>{role.permissions.slice(0, 8).map((item) => item.permission.name).join("、")}</p></article>)}</div></section>
      <section className="panel"><h2>操作日志</h2><DataTable headers={["时间", "账号", "动作", "对象"]} rows={logs.map((log) => [new Date(log.createdAt).toLocaleString("zh-CN"), log.user?.name || "-", log.action, log.entity])} /></section>
    </div>
  );
}

function TwoColumn({ title, form, children }: { title: string; form: React.ReactNode; children: React.ReactNode }) {
  return <div className="split"><section className="panel"><h2>{title}</h2>{form}</section><section className="panel list-panel">{children}</section></div>;
}

function QuickForm({ fields, submitText, onSubmit, onDone, setMessage }: { fields: string[][]; submitText: string; onSubmit: string; onDone: () => void | Promise<unknown>; setMessage: (value: string) => void }) {
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget).entries());
    try {
      await api(onSubmit, { method: "POST", body: JSON.stringify(data) });
      (event.currentTarget as HTMLFormElement).reset();
      await onDone();
      setMessage("保存成功");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保存失败");
    }
  }
  return <form className="quick-form" onSubmit={submit}>{fields.map(([name, label]) => <input key={name} name={name} placeholder={label} />)}<button>{submitText}</button></form>;
}

function AppointmentForm({ resources, onDone, setMessage }: { resources: { employees: Employee[]; services: ServiceItem[]; customers: Customer[]; rooms: { id: string; name: string }[]; equipment: { id: string; name: string }[] } | null; onDone: () => void | Promise<unknown>; setMessage: (value: string) => void }) {
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget).entries());
    try {
      await api("/api/schedule/appointments", { method: "POST", body: JSON.stringify(data) });
      await onDone();
      setMessage("预约创建成功");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "预约失败");
    }
  }
  if (!resources) return <p className="hint">正在加载资源...</p>;
  return (
    <form className="quick-form" onSubmit={submit}>
      <select name="customerId">{resources.customers.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select>
      <select name="employeeId">{resources.employees.filter((item) => ["therapist", "nurse"].includes(item.roleType)).map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select>
      <select name="serviceItemId">{resources.services.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select>
      <select name="roomId"><option value="">不指定房间</option>{resources.rooms.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select>
      <select name="equipmentId"><option value="">不指定设备</option>{resources.equipment.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select>
      <input name="date" type="date" required />
      <input name="startTime" type="time" required />
      <input name="endTime" type="time" required />
      <input name="notes" placeholder="备注" />
      <button>创建预约</button>
    </form>
  );
}

function DataTable({ headers, rows }: { headers: string[]; rows: (string | number)[][] }) {
  return <div className="table"><div className="thead">{headers.map((item) => <strong key={item}>{item}</strong>)}</div>{rows.map((row, index) => <div className="tr" key={index}>{row.map((cell, cellIndex) => <span key={cellIndex}>{cell}</span>)}</div>)}{rows.length === 0 && <Empty text="暂无数据" />}</div>;
}

function Empty({ text }: { text: string }) {
  return <div className="empty">{text}</div>;
}
