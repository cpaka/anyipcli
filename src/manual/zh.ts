export const ZH_MANUAL = `
# anyIP CLI — 用户手册

## 概述

anyIP.io 提供住宅代理和移动代理，适用于网页抓取、自动化操作和数据采集。
本 CLI 工具让你通过终端管理代理账户、监控流量、创建代理会话，
甚至用自然语言一键生成最优代理配置。

官方文档：https://anyip.io/docs/guides/quick-start

---

## 安装

### 全局安装（推荐）
    npm install -g anyip-cli
    anyip --help

### 从源码安装
    git clone <仓库地址>
    cd anyip-cli
    npm install
    npm run build
    npm link

### 无需安装（临时使用）
    npx anyip-cli <命令>

---

## 首次配置

### 方式 A — 交互式输入（密钥不会出现在 shell 历史中）
    anyip config set-keys

### 方式 B — 通过参数传入
    anyip config set-keys --anyip 你的ANYIP密钥 --claude 你的CLAUDE密钥

### 方式 C — 环境变量（推荐用于 CI/CD）
    export ANYIP_API_KEY=你的anyip密钥
    export ANTHROPIC_API_KEY=你的claude密钥

环境变量的优先级高于本地存储的配置。
Claude 密钥为可选项，仅在使用 \`anyip generate\` 和非英文 \`anyip man\` 时需要。

### 查看当前配置
    anyip config show          # 显示已脱敏的密钥及配置文件路径

### 清除配置
    anyip config clear

---

## 账户管理

    anyip account              # 以表格形式列出所有代理账户
    anyip account me           # 查看 anyIP 账户信息及配额
    anyip account list         # 同上
    anyip account list --json  # 输出 JSON 格式（适合脚本使用）
    anyip account inspect <id>            # 查看某个账户的详细信息
    anyip account inspect <id> --json     # JSON 格式输出
    anyip account create -d "我的代理" --type residential --country US
    anyip account enable <id>
    anyip account disable <id>
    anyip account bulk-reset              # 重置所有账户的带宽配额（需确认）
    anyip account bulk-reset --yes        # 跳过确认（用于脚本）

### 创建代理账户的参数说明
    -d, --description <描述>   必填，代理账户的名称
    --type <类型>              residential（住宅）| mobile（移动）
    --country <代码>           ISO 国家代码，例如 US、FR、DE、TH
    --region <名称>            省/州名称（小写），例如 california
    --city <名称>              城市名称（小写），例如 paris
    --session <名称>           粘性会话名称（字母+数字+下划线）
    --sess-time <分钟>         会话时长 1–10080（默认：7天）
    --quota <字节数>           带宽上限（默认：1 GB = 1073741824）
    --password <密码>          自定义密码（不填则自动生成）

---

## 会话管理

会话是保存在本地的代理连接配置。\`get\` 命令会查找或创建一个会话，
并通过实时 curl 请求验证其可用性。

### 查找 / 创建 / 测试代理会话
    anyip get                                    # 使用第一个账户，移动代理，SOCKS5
    anyip get --residential --location US        # 美国住宅代理
    anyip get --mobile --location FR             # 法国移动代理
    anyip get --residential --rotating           # 轮换 IP（每次连接使用新 IP）
    anyip get --residential --time 30            # 粘性会话，30 分钟
    anyip get --user 2                           # 使用第 2 个代理账户
    anyip get --list                             # 仅列出匹配会话，不执行 curl

### 管理已保存的会话
    anyip proxy list                  # 列出所有已保存的会话
    anyip proxy list --user 1         # 筛选属于账户 #1 的会话
    anyip proxy get <名称>            # 查看某个会话的详细信息
    anyip proxy curl <名称>           # 打印 curl 测试命令
    anyip proxy curl <名称> --run     # 执行 curl 测试
    anyip proxy add 服务器:端口:用户名:密码   # 从连接字符串导入会话
    anyip proxy import proxies.txt    # 批量导入（每行一个连接字符串）
    anyip proxy delete <名称>         # 删除指定会话
    anyip proxy clear                 # 删除所有会话（需确认）

---

## 流量监控

    anyip traffic list                            # 每日发送/接收流量（最近 30 天）
    anyip traffic list --interval hourly          # 按小时统计
    anyip traffic usage                           # 团队配额：已用 / 剩余
    anyip traffic list --from 2024-01-01          # 按起始日期筛选
    anyip traffic list --to 2024-01-31            # 按截止日期筛选
    anyip traffic list --proxy <id>               # 按代理账户 ID 筛选
    anyip traffic list --json                     # JSON 格式输出
    anyip traffic export                          # 输出 CSV 到标准输出
    anyip traffic export -o traffic.csv           # 保存到文件

---

## 地理数据查询

    anyip country                      # 所有可用国家列表
    anyip country --json
    anyip region US                    # 美国可用的省/州列表
    anyip city US california           # 某个省/州的城市（名称或 slug 均可）
    anyip city US                      # 按省/州列出全国城市
    anyip asn US                       # 美国的 ISP/运营商 ASN 列表

用于确认 --country、--region 等参数的有效值。

---

## 快速代理测试

    anyip check 1     # 检查第 1 个代理账户（通过 ip-api.com 获取 IP 信息）

---

## AI 代理生成器

用自然语言描述你的需求，Claude 会分析并自动创建最优的代理账户组合。

    # 直接描述
    anyip generate "抓取亚马逊价格，5 个美国城市，轮换 IP"

    # 交互式输入（不带参数则弹出提示）
    anyip generate

    # 预览方案，不实际创建
    anyip generate "法国 10 个 Instagram 账号，粘性会话" --dry-run

    # 将凭据列表保存到文件
    anyip generate "美国住宅代理用于 SEO 监控" --output proxies.txt

生成完成后，所有会话会自动保存到本地，可立即使用 \`anyip proxy list\` 查看。

---

## 本地 Web 控制台

在浏览器中可视化管理代理：

    anyip serve               # 打开 http://127.0.0.1:3000
    anyip serve --port 8080   # 自定义端口

按 Ctrl+C 停止服务。控制台功能包括：
- 代理账户列表（支持启用/禁用）
- AI 代理生成表单
- 流量概览
- 会话查看器

---

## 查看手册

    anyip man                  # 英文手册
    anyip man --language zh    # 中文手册（本文档）
    anyip man --language ru    # 俄文手册

---

## 代理 URL 格式

    http://用户名:密码@gate.anyip.io:8080         （HTTP 代理）
    socks5://用户名:密码@portal.anyip.io:1080     （SOCKS5 代理）

用户名中内嵌连接属性（逗号分隔）：
    http://user_账户ID,type_residential,country_US,session_会话名:密码@gate.anyip.io:8080

属性说明：
    user_XXXX       代理账户标识符
    type_XXX        residential | mobile
    country_XX      ISO 国家代码
    region_XXX      省/州 slug
    city_XXX        城市 slug
    session_NAME    粘性会话名称（不设置则为轮换模式）
    sesstime_N      会话时长（分钟）

---

## 环境变量

    ANYIP_API_KEY        anyIP.io API 密钥（优先于本地配置）
    ANTHROPIC_API_KEY    Claude API 密钥（优先于本地配置）
    NO_COLOR             设为任意值可禁用彩色输出

---

## 使用技巧

- 在数据命令后加 \`--json\` 可管道处理：\`anyip account list --json | jq '.[].username'\`
- \`anyip get\` 会记住会话 — 运行一次即可重复使用
- 抓取任务建议使用 \`--rotating\`（每次连接换新 IP，速度最快）
- 账号管理建议使用 \`--session 名称\`（每个账号绑定固定 IP）
- CI/CD 场景：将 \`ANYIP_API_KEY\` 设为密钥变量，无需运行 \`anyip config set-keys\`
- 配额换算：1 GB = 1073741824 字节，5 GB = 5368709120 字节
`;
