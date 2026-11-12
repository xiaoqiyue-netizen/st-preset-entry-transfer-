# 预设条目转移工具 v0.2.0

适配目标：SillyTavern 1.19.0（Chat Completion / Prompt Manager）

## 重要说明

这是安全的 JSON 合并版 MVP。它不直接写入酒馆服务器上的预设：
1. 在酒馆中分别导出来源预设和目标预设 JSON。
2. 在扩展界面上传两个 JSON。
3. 选择要复制的自定义提示词。
4. 下载合并后的目标预设 JSON。
5. 在酒馆预设管理器中将合并文件导入为新预设。

这样能确保来源文件不会被修改，也不会在插件运行时直接覆盖现有预设。

## 功能
- 同类 Chat Completion 预设之间复制自定义 Prompt Manager 条目。
- 多选、全选、取消全选。
- 保留提示词对象的全部字段。
- 尽量保留全局 prompt_order 中的启用状态和顺序信息。
- 目标中已有相同 identifier 或 name 的条目会跳过，不覆盖。
- 不调用模型 API，不读取或上传 API Key。
- 不删除或改写来源预设。

## 安装（需要托管方允许第三方扩展）
把整个 `preset-entry-transfer` 文件夹放入 SillyTavern 的第三方扩展目录，或将此项目上传到 Git 仓库后，通过扩展安装入口安装仓库 URL。

典型目录：
`SillyTavern/public/scripts/extensions/third-party/preset-entry-transfer/`

若使用的是别人托管的网页酒馆，可能没有服务器文件写入权限。此时需要托管方允许安装扩展，或让托管方代为安装。仅上传 ZIP 到普通网页文件区并不会自动安装为扩展。

## 使用
1. 在酒馆预设管理器导出来源和目标 Chat Completion 预设 JSON。
2. 打开扩展面板「预设条目转移工具」。
3. 上传两个 JSON，点「读取来源条目」。
4. 勾选要复制的条目。
5. 点「生成合并后的目标预设 JSON」。
6. 回到预设管理器，将新 JSON 导入并另存为新预设。

## 限制
- 本版只处理 Chat Completion 的 `prompts` 与全局 `prompt_order`。
- Advanced Formatting 模块尚未实现。
- 不处理角色专属 `prompt_order` 覆盖项。
- 对标识符/名称冲突采用跳过策略，不提供自动重命名。
- 这是未在用户托管实例上实测的 MVP。请先备份，并使用预设副本测试。
