# OfferPilot Light

> 本地优先、开箱即用的 AI 技术面试训练助手。

OfferPilot Light 面向想在自己电脑上快速练习技术面试的用户。它基于 PDF 简历生成专属题目，保留每一次作答和评分，并提供语音模拟、错题归纳、复盘报告与 Java 八股复习卡片。

不需要 Docker、Node.js、数据库服务或云端账号。准备一个兼容 OpenAI Chat Completions 的模型 API Key，即可在本机运行。

## 功能一览

- **简历驱动出题**：上传 PDF 简历后，生成基础八股、项目/实习深挖、业务场景、系统设计与反问题；每题附带具体的“简历依据”。
- **逐题 AI 评价**：保存原始回答，输出分数、重点评价、改进建议和面试官追问；支持重新作答。
- **语音模拟面试**：根据简历开启连续追问式模拟面试，并在结束后给出整体评价。
- **题库与复盘**：完整完成一套题后归档，异步生成研究式复盘报告，方便回看训练过程。
- **错题归纳**：自动收集低于 70 分的回答，支持按维度筛选、回到原题重做或删除无效题目。
- **畅享八股**：内置 Java 基础篇与 Java 集合篇高频卡片；点击翻转查看详细答案，记录掌握状态。
- **本地数据保存**：训练题目、作答、评分与报告保存在本机 SQLite 文件中，重启电脑不会清空。

## 快速开始

### 独立应用包

仓库提供 PyInstaller 构建配置。推送形如 `v1.0.0` 的版本标签后，GitHub Actions 会自动构建 Windows 和 macOS 压缩包并发布到 Releases。使用独立应用包不需要用户预装 Python；下载对应系统的压缩包、解压并运行 `OfferPilotLight` 即可。

### 前置条件

只需安装 **Python 3.10 或更高版本**。

```bash
python --version
# macOS / Linux 也可以使用
python3 --version
```

### Windows

```powershell
git clone https://github.com/Yin123-ybh/offerpilot-light.git
cd offerpilot-light
start.cmd
```

也可以下载 ZIP 并解压，然后直接双击 `start.cmd`。脚本会自动创建虚拟环境、安装依赖、启动本机服务并打开浏览器。

### macOS / Linux

```bash
git clone https://github.com/Yin123-ybh/offerpilot-light.git
cd offerpilot-light
chmod +x start.sh
./start.sh
```

首次启动会自动创建 `.venv` 虚拟环境并安装依赖，服务就绪后会自动打开浏览器；后续启动只有在 `requirements.txt` 变化时才会重新安装依赖：

```text
http://localhost:5175
```

后续启动无需重复安装，Windows 双击 `start.cmd`；macOS/Linux 在项目目录执行 `./start.sh` 即可。

脚本默认只监听本机 `127.0.0.1:5175`。需要更换端口时，可在 macOS/Linux 执行 `PORT=5180 ./start.sh`，Windows 可设置环境变量 `set PORT=5180` 后运行 `start.cmd`。

## 配置模型

进入页面后，点击左侧的 **“连接 AI 大模型”**，可分别配置文本题目模型与语音面试模型。

文本模型用于出题、逐题评分和复盘报告；语音模型用于语音面试开场、追问和结束评价。若供应商没有专门的语音模型，也可以临时填入同一个文本模型完成文字版模拟。

### 推荐的兼容配置

| 服务商 | 服务地址 | 文本模型示例 | 说明 |
| --- | --- | --- | --- |
| 通义千问 | `https://dashscope.aliyuncs.com/compatible-mode/v1` | `qwen-plus` | 适合中文技术题、稳定性好 |
| 通义千问 | `https://dashscope.aliyuncs.com/compatible-mode/v1` | `qwen3.5-omni-flash` | 可用于语音模拟通道 |
| DeepSeek | `https://api.deepseek.com/v1` | `deepseek-chat` | 成本较低，适合文本出题与评价 |

填写后使用“测试此通道”确认模型可用。API Key 只保存在当前浏览器的本地存储中，不会写入项目文件、SQLite 数据库或 Git 仓库。

> 供应商接口必须兼容 `POST /chat/completions`，并支持返回 JSON 格式内容。模型名称和额度以服务商控制台为准。

## 使用流程

1. 配置并测试文本模型；需要语音模拟时再配置语音模型。
2. 进入“面试训练”，选择岗位路线，填写岗位描述并上传 PDF 简历。
3. 点击“生成专属面试题”。题目会按简历事实给出依据，避免脱离经历的泛化提问。
4. 逐题作答并提交评价。你可在任意题上重新作答，原始回答和最新评价都会保留。
5. 所有题目完成后，选择“提交”归档，或选择“生成报告”自动归档并异步生成复盘。
6. 在“我的题库”“错题归纳”“复盘报告”中继续训练和回顾。

## 数据与隐私

| 数据 | 保存位置 | 是否上传到模型服务 |
| --- | --- | --- |
| 训练题目、回答、评分、报告 | `data.sqlite3` | 题目和回答仅在生成、评价、报告时发送给你配置的模型服务 |
| API Key | 浏览器 Local Storage | 不写入后端数据库或项目文件 |
| PDF 简历原文件 | 不保存 | 仅在浏览器解析并将提取文本用于当前请求 |

请自行备份 `data.sqlite3`，它就是你的本地训练档案。删除该文件会清空本机训练数据，但不会影响代码；升级项目代码前也建议备份它。

## 项目结构

```text
offerpilot-light/
├── agent.py          # FastAPI 本地 Agent 与 SQLite 数据接口
├── public/           # 已构建的前端页面和静态资源
├── requirements.txt  # Python 依赖
├── start.cmd         # Windows 一键启动脚本
├── start.sh          # macOS / Linux 一键启动脚本
└── data.sqlite3      # 本地训练数据（运行后生成，已被 Git 忽略）
```

## 手动启动与更换端口

```bash
# macOS / Linux
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python -m uvicorn agent:app --host 127.0.0.1 --port 5175
```

```powershell
# Windows PowerShell
py -3 -m venv .venv
.venv\Scripts\python.exe -m pip install -r requirements.txt
.venv\Scripts\python.exe -m uvicorn agent:app --host 127.0.0.1 --port 5175
```

使用其他端口时，把命令末尾的 `5175` 改为目标端口，并在浏览器访问对应地址。例如：

```bash
.venv/bin/python -m uvicorn agent:app --host 127.0.0.1 --port 5180
```

## 常见问题

### 启动提示找不到 Python

安装 Python 3.10+ 后重新打开终端。Windows 安装时勾选“Add Python to PATH”；也可以从 [Python 官网](https://www.python.org/downloads/) 安装后使用 `py -3 --version` 验证。

### 浏览器打不开 `localhost:5175`

确认启动窗口没有关闭，并检查终端是否有错误信息。若端口被占用，结束旧进程，或改用上文的其他端口启动。

### 出题或评价失败

优先在“连接 AI 大模型”中测试当前通道。常见原因包括 API Key 无效、模型名称错误、账户余额不足、服务地址不兼容，或网络无法访问模型服务。

### PDF 解析为空

扫描件或特殊字体 PDF 可能无法提取文字。可以尝试 OCR 后的 PDF，或在页面的岗位描述中补充项目、技术栈和经历信息；系统不会凭空编造简历事实。

### 我的训练数据会消失吗

不会。数据保存在项目目录的 `data.sqlite3`；只要不删除该文件，第二天或重启后仍可继续训练。迁移电脑时复制该文件到新项目目录即可。

### 如何彻底清空训练数据

先关闭应用，再删除 `data.sqlite3`。这会永久删除本机的题套、回答、评分和报告，建议先复制备份。

## 适用范围

OfferPilot Light 适合个人本地使用和快速部署。需要多用户、权限管理、独立 PostgreSQL/Redis/对象存储、容器编排或生产级部署时，请使用 [OfferPilot 正式版](https://github.com/Yin123-ybh/offerpilot)。

## License

本项目当前未声明开源许可证。若计划二次分发、商用或接受外部贡献，建议在仓库中补充明确的 LICENSE 文件。
