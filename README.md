# OfferPilot Light

轻量版本地 AI 面试助手。只有 Node.js 和一个模型 API Key，不需要 Docker、Python、数据库、Redis 或对象存储。

## 一键启动

### macOS / Linux

```bash
git clone https://github.com/Yin123-ybh/offerpilot-light.git
cd offerpilot-light
sh start.sh
```

### Windows

```powershell
git clone https://github.com/Yin123-ybh/offerpilot-light.git
cd offerpilot-light
start.cmd
```

先安装 Node.js 18+。首次运行会自动安装依赖，之后双击脚本即可启动：

- Windows：双击 `start.cmd`
- macOS / Linux：在终端执行 `sh start.sh`（或先执行 `chmod +x start.sh`，再双击运行）

也可以在项目目录执行：

```bash
npm install
npm start
```

打开 <http://localhost:5175>，点击“模型设置”填写兼容 OpenAI Chat Completions 的 API Key、服务地址和模型名称，再上传 PDF 简历即可。

项目不需要 Docker、Python、PostgreSQL、Redis 或单独的前端构建环境。下载 ZIP、解压、运行启动脚本即可。

Windows PowerShell、macOS Terminal、Linux Shell 使用相同命令。训练记录保存在当前目录的 `data.json`，API Key 只保存在浏览器本机。

## 推荐模型

- 通义千问：`https://dashscope.aliyuncs.com/compatible-mode/v1`，模型 `qwen-plus`
- DeepSeek：`https://api.deepseek.com/v1`，模型 `deepseek-chat`

## 常用操作

```bash
# 更换端口
PORT=5180 npm start

# Windows PowerShell 更换端口
$env:PORT=5180; npm start
```

轻量版适合个人快速使用；完整 Docker 版请使用主仓库的企业化架构。
