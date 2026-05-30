# 腾讯云服务器部署说明

当前部署方案为单机 Docker 版，适合演示、试用和第一期内测。数据库使用 SQLite 并挂载到 Docker volume，后续正式商用建议迁移到 PostgreSQL。

## 服务器要求

- Tencent Cloud Lighthouse/CVM，推荐 Ubuntu 22.04 LTS
- 安全组放行 TCP `22` 和 `3000`
- 已安装 Docker 和 Docker Compose

## 首次部署

```bash
git clone https://github.com/xuyan0307/postpartum-saas.git
cd postpartum-saas
docker compose up -d --build
```

打开：

```text
http://服务器公网IP:3000
```

默认账号：

- 总部：`admin@demo.local` / `Admin123456`
- 店长：`manager@demo.local` / `Admin123456`
- 顾问：`advisor@demo.local` / `Admin123456`

## 更新部署

```bash
cd postpartum-saas
git pull
docker compose up -d --build
```

## 常用命令

```bash
docker compose ps
docker compose logs -f
docker compose restart
docker compose down
```

## 生产化提醒

- 修改默认账号密码
- 配置域名、HTTPS 和反向代理
- 迁移到 PostgreSQL
- 配置服务器备份和数据库备份
