# Agent 运行时架构设计

## Agent 运行时目标
- 根据用户指令，匹配适当的 Skill 执行任务
- 渐进式披露 Skill，命中Skill后根据需要读取Skill指令
- 使用JSON Todos 管理任务目标，跟踪进行状态
- 大部分操作使用ByteCloud Sandbox 执行


## Skill Spec
遵循社区主流 Skill 设计规范，如Claude、OpenAI的Skill Spec。每个Skill 一个 目录，包括SKILL.md, 以及引用的其他文件和代码块等等。Skill 文件目录参考如下：
```
skill-name/
├── SKILL.md
├── references/
├── scripts/
├── assets/
```

## 工具定义
Agent 执行过程中，根据需要调用的外部工具，如ByteCloud Sandbox、以及一些外部服务等。
## 目标工具设计
- write_todos
- update_todos

### 本地工具
- Read File
- Write File
- Patch File
- Execute Command
- Code Execution
- Browser Navigation
- Browser Screenshot

### Skill 工具
- List Skills
- Load Skill

### 特殊工具设计
- 并行执行工具（在某些sandbox中，为了提升执行速度，需要并行执行多个指令，可能是接口调用，llm调用等等，可以先实现初版，后面逐步优化）

## Context 设计
Agent 执行过程中，需要维护一个上下文，用于存储任务目标、Skill 执行结果、外部服务调用结果等。
每个todo 都内部都对应独立一个上下文，上下文包含任务目标、需要的输出，结果输出等。不要把所有内容都放到一个上下文里，导致上下文膨胀。
每个任务执行结束，进行上下文更新。把一些后续需要的工具执行结果更新到上下文里。

## 完整流程示例
用户希望生成一个数据图表，正好有一个图表生成Skill，有个几个流程：
1. 获取业务输出（可能3-4个接口）
2. 解析业务指标，输出格式化数据，业务指标含义等等
3. 根据业务指标，生成 html 图表，标注关键内容
4. 把 html 页面转成pdf/png

Agent 执行过程：

前置流程：
1. 读取用户诉求，匹配适当的 Skill 执行任务
2. 执行工具调用：List Skills
   - 输入：无
   - 输出：所有 Skill 名称和描述
3. 匹配到 图表生成 Skill
4. Read Skill 指令
   - 输入：图表Skill 名称
   - 输出：Skill.MD 文件内容
5. Skill 内容放入上下文，等待参考
6. 调用write_todos 工具(更新 todos，添加新的任务和目标)，简述任务目标类似下面：
   a. 请求数据
   b. 解析数据
   c. 生成图表
   d. 转 pdf/png
---后面进入任务执行流程，每一步结束前，整体上下文，结束后更新上下文---
任务1: 请求数据
1. 整理局部的输入上下文：
   - 整体todos，和本次任务目标
   - 图表Skill 指令内容(例如，查询数据参考./references/request.md)
   - 需要的输出：业务指标数据
2. 执行工具调用，Read Skill 指令
   - 输入：Skill name: 图表Skill 名称；path: /references/request.md
   - 输出：业务指标调用示例和参数说明等
3. Sandbox Code Execution
   - 输入：LLM生成的代码块
   - Sandbox代码执行环境
   - 输出：业务指标数据
3. 判断输出，是否符合预期格式，然后更新todos
4. 更新全局上下文，把业务指标数据，放到全局上下文里（中间产物可以保存到sandbox文件中等，不在中间上下文里）

任务2: 解析数据
1. 整理局部的输入上下文：
   - 整体todos，和本次任务目标
   - 图表Skill 指令内容(例如数据处理和分析参考./references/analysis.md)
   - 业务指标数据
   - 需要的输出：业务指标数据
2. 执行工具调用，Read Skill 指令
   - 输入：Skill name: 图表Skill 名称；path: /references/analysis.md
   - 输出：业务指标调用示例和参数说明等
3. Sandbox Code Execution
   - 输入：LLM生成的代码块
   - Sandbox代码执行环境
   - 输出：格式化的业务指标数据
4. Sandbox Code Execution
   - 输入：LLM生成的代码块
   - Sandbox代码执行环境
   - 输出：计算一些环比，同比，环比增长率，同比增长率等指标
5. 输出数据洞察内容，例如：
   - 业务指标趋势
   - 业务指标异常值
6. 更新todos
7. 更新全局上下文，把业务指标数据，放到全局上下文里（中间产物可以保存到sandbox文件中等，不在中间上下文里）


## 文件目录结构
```
agent/
├── skills/
├── todo-manager/
├── tools/
├── context-manager/
├── core/
├── llm-provider/
├── type.ts
├── index.ts
```