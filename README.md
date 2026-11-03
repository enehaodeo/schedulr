# Schedulr 班级时间管理

给班级学生用的时间管理网页应用（PWA）：个人甘特图、个人日程表、按选课发布的公共任务。
不登录也能用，数据保存在浏览器（IndexedDB）；登录后同步到 Supabase 云端。

## 本地开发

```bash
npm install
npm run dev      # http://localhost:5173
npm run test     # 排程、甘特约束、同步合并的单元测试
npm run build
```

没有 `.env.local` 时应用以纯本地模式运行（无登录、公共任务、推送）。

## 接入云端（Supabase）

1. 在 https://supabase.com 新建项目。
2. SQL Editor 中执行 `supabase/migrations/0001_init.sql`。
3. Authentication → Providers → Email：按需要关闭 “Confirm email”（关闭后学生注册即可直接登录）。
4. 生成 VAPID 密钥：`npx web-push generate-vapid-keys`
5. 复制 `.env.example` 为 `.env.local`，填入 Project URL、anon key、VAPID 公钥。
6. 部署 Edge Functions（需要 Supabase CLI）：

   ```bash
   npx supabase login
   npx supabase link --project-ref <PROJECT_REF>
   npx supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:你的邮箱 CRON_SECRET=<随机字符串> APP_TIMEZONE=Asia/Shanghai
   npx supabase functions deploy send-reminders --no-verify-jwt
   npx supabase functions deploy notify-public-task --no-verify-jwt
   ```

7. 替换 `supabase/setup_jobs.sql` 中的占位符后在 SQL Editor 执行（每分钟提醒 + 新公共任务通知）。

## 部署前端

任意静态托管（Vercel / Netlify / Cloudflare Pages），构建命令 `npm run build`，输出目录 `dist`，
并配置与 `.env.local` 相同的三个环境变量。需要 HTTPS 才能使用推送；单页应用需把所有路径回退到 `index.html`。

## 说明

- 同步策略：每行带客户端修改时间 `updated_at`，后写胜出；删除为软删除。
- 推送：登录后在“我 → 开启通知”订阅。iPhone / iPad 需用 Safari “添加到主屏幕”后从主屏幕打开再开启。
- 退出登录会清空本浏览器中的数据（云端保留），避免共用电脑时数据泄露。
