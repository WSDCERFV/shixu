# 开发与构建

## 环境

- Windows 10 / 11，x64。
- Node.js >= 22.12.0，建议使用 Node.js 24。
- npm 与 Git。锁文件固定依赖版本，使用 `npm ci` 安装。

## 目录

```text
desktop/
  ui-source.html        界面、交互和本地工作区模型
  main.cjs              Electron 主进程与受限 IPC
  preload.cjs           提供给界面的受限操作
  services.cjs          AI、音频转写、邮件协议与校验
  ai-stream.cjs         SSE 读取、分段超时、取消、完成与有限重试
  planning-engine.cjs   上下文裁剪、空闲时段和确定性冲突避让
  planning-skill.cjs    按需加载内置技能及 JSON 合约
  skills/shixu-planner/ 内置规划技能及课表调整规则
  seu-page.cjs          临时学校页面内的表单填入与课表读取
  planner-domain.cjs    日期、重复计划及文件课表解析
  local-store.cjs       顺序写入、原子替换、有效备份与恢复
  storage-paths.cjs     安装目录之外的数据、缓存与临时路径
  seu-importer.cjs      按需打开的临时学校登录与抓取窗口
  detail-window.cjs     独立任务与计划详情窗
  startup.cjs           当前 Windows 用户的可选开机启动
  updates.cjs           正式版本检查、可取消下载及安装前校验
  runtime-dependencies.cjs 打包时复制一致的生产依赖
  release-metadata.cjs  发布前核对安装包与 latest.yml
  build-ui.cjs          生成离线界面
  electron-builder.cjs  Windows 安装程序配置
  package-preview.cjs   独立数据目录的免安装版
  test/                 单元测试与桌面回归检查
docs/                   文档、截图及第三方许可
```

## 安装依赖

在仓库的 `desktop` 目录执行 `npm ci`。如果 npm 禁止了依赖安装脚本，随后运行 `node node_modules/electron/install.js` 下载 Electron。

不必另外下载 Playwright 浏览器：当前桌面测试使用安装好的 Electron。所有依赖只用于本地开发或构建，终端用户直接运行 Releases 文件。

## 编辑界面

修改 `ui-source.html` 后运行 `npm run prepare-ui` 或 `npm start`。构建结果还包括独立详情窗和离线图标资源，不要只手动修改生成的 `renderer.html`。

如需使用另一个明确指定的界面源，可设置绝对 `SHIXU_UI_SOURCE`。默认总是使用仓库内的文件。

## 测试

`npm test` 运行 `test/*.test.cjs`，不需要网络模型或真实学校账号。

`npm run test:desktop` 在 Windows 打开隔离测试窗口，覆盖极简草案、周计划/独立详情及存储故障恢复。截图和临时记录写入根目录 `.test-artifacts/`，已在忽略规则中排除。测试采用本地模拟模型服务和隔离的学校页面夹具，不会调用你的真实 AI 配置或使用学生账号。新增检查覆盖两种流式协议、取消与失败、模板配置、延迟认证表单、学期名称确认、错学期阻断、整学期预览、技能自动加载及本地冲突阻断。

`check-course-planning-scope.cjs` 用 240 节模拟课程验证未确认和已确认课表、普通排程、越界模型输出、单次调课、导入保存失败及旧对话重启恢复。课程编辑范围在共享的 `planner-domain.cjs` 与主进程中独立计算，远端返回值不能自行扩大授权范围；课表的完整占用仍由本地校验使用。

手动开发也应设置绝对 `SHIXU_DATA_DIR`，例如 `%TEMP%\shixu-development`。该变量会隔离全部运行目录，并禁用真实开机启动设置；不要把测试数据复制到发布目录。

## 构建安装程序

运行 `npm run dist`。输出位于 `outputs/时序安装包-版本号/`。安装向导可选择目录，升级保留原记录，卸载保留个人日程；程序正在运行时会拒绝覆盖，不强制关闭编辑窗口。

`release-files.cjs` 是发布文件允许清单，`runtime-dependencies.cjs` 递归列出生产依赖，`release-audit.cjs` 检查实际归档中没有个人记录或测试文件、没有遗漏运行依赖。签名证书不在仓库中，当前发行程序未签名。

构建工具首次需要联网下载。网络受限时可以显式配置 `ELECTRON_BUILDER_BINARIES_MIRROR`，但不要关闭固定校验和验证；不要把自己的凭据写入配置或仓库。

## 构建免安装版

运行 `npm run package:preview`，输出 `outputs/时序免安装预览-版本号/`。首次默认极简模式、空白任务，数据保存在程序旁“预览数据”。脚本拒绝覆盖已有目录，避免删除其中的个人预览记录。

分发前确认目录没有运行产生的个人数据，再压缩整个文件夹。安装包、免安装包和校验和应放入 GitHub Releases，源码归档不包含依赖和生成文件。

## 应用内更新与发布

更新源固定为本仓库的 GitHub Releases。`npm run dist` 不上传文件，但会生成 `latest.yml`、安装包及 `.blockmap`；随后运行 `node release-metadata.cjs` 核对版本、大小和 SHA-512。客户端不自动下载、不允许降级、不在普通退出时安装。开发环境和设置了 `SHIXU_DATA_DIR` 的隔离环境禁用真实安装，预览版只提供检查与发布页入口。

更新本地代码不会改变已安装的程序。发布时同时更新 package.json / package-lock.json 的版本，将源码提交并推送同名稳定标签（例如 `v0.8.3`）。`.github/workflows/release.yml` 会检查标签与源码版本、测试、构建、验证更新清单，再把安装包、`.blockmap`、`latest.yml`、完整预览 ZIP、源码 ZIP 和 SHA-256 校验和上传到草稿，上传成功后才公开。也可从 Actions 手动运行，填写已存在的标签。工作流需要仓库的 Actions 写入 Releases 权限。

发布工作流在 `npm ci` 后显式运行 Electron 的安装脚本，避免 npm 的依赖脚本策略跳过运行环境下载，导致干净构建机缺少 `electron/dist`。修改发布流程后，可从默认分支手动运行并指定原稳定标签，继续构建该标签的应用源码，无需移动已有标签。

已公开版本不可替换，修复后递增版本再发布。缺少 `latest.yml` 时客户端只提供手动覆盖安装入口；旧版首次需手动安装带更新功能的新版本。详见 [更新与发布](UPDATES.md)。

## 提交前

- 只提交源码、测试、文档和必要资源。
- 检查 `git diff --cached`，确认没有账号、密钥、真实日程或本机绝对路径。
- 按改动运行对应的单元或桌面检查，不必为纯文案修改增加镜像实现的测试。
- UI 修改应同时检查普通/极简、深浅主题，以及小窗口和较高缩放。
