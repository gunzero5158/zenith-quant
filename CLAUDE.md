# Antigravity ZenithAnalysis 开发规范

@AGENTS.md

## 全局规则与规范 (Global Rules)

1. **文档归档要求**：
   - 所有关于该项目的**产品方案、需求细节、设计讨论、实现记录、任务清单**等，必须完整且唯一地归档在项目文件夹的 [docs/](file:///D:/projects/zenith-quant/docs) 目录下进行版本管理。
   - **禁止**将其仅保存在 C 盘等 IDE 专属或临时缓存目录中。
   - 项目的核心文档规范归档在：
     - 实现计划：[docs/implementation_plan.md](file:///D:/projects/zenith-quant/docs/implementation_plan.md)
     - 开发与调试总结：[docs/walkthrough.md](file:///D:/projects/zenith-quant/docs/walkthrough.md)
     - 任务执行状态清单：[docs/task.md](file:///D:/projects/zenith-quant/docs/task.md)

2. **开发与运行约束**：
   - 物理代码与开发运行服务必须且仅能在 D 盘的 `D:\projects\zenith-quant` 物理目录下执行。
   - C 盘对应的 IDE 默认工作区（如 `C:\Users\gunze\Documents\antigravity\focused-hypatia`）仅能通过 Windows Junction (`mklink /J`) 软链接指向 D 盘目录以供 IDE 监视，严禁将物理代码复制到 C 盘运行。
