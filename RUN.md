# GOAL 2026 — 运行文档

世界杯主题声控足球小游戏。纯静态网页，无依赖（Canvas 2D + Web Audio + MediaDevices + MediaRecorder）。

## 1. 文件结构

```
mmp/
├── index.html      # 5 个界面：选国家 → 首页 → 权限 → 比赛 → 结果
├── styles.css      # 8-bit 街机像素 UI
├── game.js         # 游戏循环 / 渲染 / 音频分析 / 摄像头 / 录屏 / 关卡进度
├── serve.js        # 零依赖 Node 静态服务器
├── cloudflared     # Cloudflare 隧道二进制（用于临时公网 HTTPS，可选）
└── RUN.md          # 本文档
```

游戏进度（国家、关卡、最佳记录、已击败 Boss）保存在浏览器 `localStorage`，key 为 `goal2026.save.v1`。

## 2. 本地运行

需要 Node.js（已验证 v20）。

```bash
cd /root/mmp
node serve.js
```

默认监听 `0.0.0.0:5175`，打开：

```
http://127.0.0.1:5175/
```

可用环境变量调整：

```bash
PORT=8080 HOST=127.0.0.1 node serve.js   # 改端口 / 只绑本机
```

> `localhost` / `127.0.0.1` 属于浏览器“安全上下文”，麦克风和摄像头可正常授权。

## 3. 关于 HTTPS、麦克风、摄像头（重要）

浏览器只在 **安全上下文** 下允许 `getUserMedia`（麦克风/摄像头）：

- ✅ `localhost` / `127.0.0.1`（HTTP 即可）
- ✅ 任意 **HTTPS** 域名
- ❌ 通过 **公网 IP + HTTP** 访问 → 麦克风/摄像头被禁用

因此：

- **本机测试**：直接用 `127.0.0.1`，麦克风全功能可用。
- **公网 HTTP（裸 IP）**：只能用**练习模式**（长按空格 / 长按球场）来测试玩法，声控不可用。
- **公网正式体验**：必须 HTTPS（见 4.2 / 4.3）。

## 4. 公网访问方式

> 以下均为「临时测试」用法。生产部署见第 5 节。

### 4.1 直接用服务器公网 IP（HTTP，临时）

服务器公网地址：

- IPv4：`5.78.41.8`
- IPv6：`2a01:4ff:1f0:1a59::1`

启动（绑定所有网卡）：

```bash
cd /root/mmp
HOST=0.0.0.0 node serve.js          # serve.js 默认即 0.0.0.0
```

访问：

```
http://5.78.41.8:5175/
```

注意：

- 麦克风/摄像头不可用，仅练习模式可玩（见第 3 节）。
- 操作系统防火墙当前为放行（ufw inactive，iptables INPUT policy ACCEPT）。
- 若外网打不开：检查 **Hetzner Cloud 防火墙** 或 **宝塔/aaPanel** 安全组，放行入站 **TCP 5175**。
- 想去掉端口号用 `http://5.78.41.8/`：用 `PORT=80 node serve.js`（80 端口需 root，且不要与已有 Web 服务冲突）。

### 4.2 Cloudflare 临时隧道（自带 HTTPS，无需账号）

适合「想用真麦克风、又不想配证书」的快速分享。隧道向外拨号，无需放行入站端口。

```bash
cd /root/mmp
node serve.js &                                      # 先起本地服务
./cloudflared tunnel --no-autoupdate --url http://127.0.0.1:5175
```

启动后日志里会出现一个形如
`https://xxxx-xxxx.trycloudflare.com` 的地址，即公网 HTTPS 入口（麦克风/摄像头可用）。

特点：**临时**地址，进程重启即变；Cloudflare 可能过段时间回收。仅适合演示。

### 4.3 永久 HTTPS（推荐用于正式分享）

三个文件是纯静态资源，可直接托管到任意静态站点（免费）：

- Vercel / Netlify / Cloudflare Pages / GitHub Pages

部署后得到固定 HTTPS 域名，麦克风/摄像头/录屏全部可用。需要对应平台账号登录。

## 5. 停止服务

```bash
# 停掉静态服务器（按监听端口找 PID）
PID=$(ss -ltnp | grep ':5175' | grep -oE 'pid=[0-9]+' | head -1 | cut -d= -f2)
[ -n "$PID" ] && kill "$PID"

# 停掉 Cloudflare 隧道（如有）
pkill -x cloudflared
```

验证已关闭：

```bash
ss -ltn | grep ':5175'        # 无输出 = 已关闭
pgrep -x cloudflared          # 无输出 = 隧道已停
```

> 注意：用 `pkill -f serve.js` 容易把当前 shell 自身命令行也匹配进去导致误杀，建议按端口 PID 精确 kill。

## 6. 开机自启 / 常驻（可选）

临时进程会在重启或会话结束后消失。若需常驻，用 systemd：

```ini
# /etc/systemd/system/goal2026.service
[Unit]
Description=GOAL 2026 static server
After=network.target

[Service]
WorkingDirectory=/root/mmp
ExecStart=/usr/bin/node /root/mmp/serve.js
Environment=PORT=5175 HOST=0.0.0.0
Restart=always

[Install]
WantedBy=multi-user.target
```

```bash
systemctl enable --now goal2026
systemctl status goal2026
```

## 7. 常见问题

| 现象 | 原因 / 处理 |
| --- | --- |
| 麦克风无反应 | 公网 HTTP 下被浏览器禁用；改用练习模式，或走 HTTPS（4.2/4.3） |
| 摄像头黑屏 | 同上；练习/无摄像头时游戏仍可玩，画中画显示 NO CAM |
| 外网打不开端口 | 检查云防火墙 / 宝塔安全组放行 TCP 端口 |
| 回放无法生成 | 浏览器不支持当前 WebM 编码；游戏不阻断，分享/下载按钮自动隐藏 |
| 进度想清空 | 浏览器控制台执行 `localStorage.removeItem('goal2026.save.v1')` |
| 端口被占用 | 换端口 `PORT=8080 node serve.js` |

## 8. 当前状态

- 临时公网访问：**已关闭**（端口 5175 未监听，隧道已停）。
- 重新本地运行：`cd /root/mmp && node serve.js` → `http://127.0.0.1:5175/`
