# 月子产康 SaaS 管理平台

一期商业 SaaS 底座原型，参考 Gauzy 的模块边界重新设计，不复制 Gauzy 源码。

## 本地启动

```powershell
Copy-Item .env.example .env
npm install
npm run db:init
npm run dev
```

打开 `http://localhost:3000`。

默认账号：

- 总部账号：`admin@demo.local` / `Admin123456`
- 店长账号：`manager@demo.local` / `Admin123456`
- 顾问账号：`advisor@demo.local` / `Admin123456`

## 说明

本地默认使用 SQLite，方便快速演示。生产部署时将 Prisma datasource 切换为 PostgreSQL，并把 `DATABASE_URL` 指向 PostgreSQL。

如果你的本地 Prisma `db push` 可用，也可以使用 `npm run db:reset` 重建数据库。
