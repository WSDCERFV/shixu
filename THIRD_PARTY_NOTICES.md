# 第三方组件与资源

项目许可证不替代第三方组件各自的许可证。依赖的准确版本与完整依赖关系以 `desktop/package-lock.json` 为准。

| 组件 | 版本 | 许可 | 用途 |
| --- | --- | --- | --- |
| [Electron](https://github.com/electron/electron) | 45.0.0 | MIT；Chromium 等另有声明 | Windows 桌面运行环境 |
| [Lucide](https://github.com/lucide-icons/lucide) | 0.468.0 | ISC，部分源自 Feather / MIT | 界面图标 |
| [Nodemailer](https://github.com/nodemailer/nodemailer) | 10.2.1 | MIT-0 | SMTP 邮件发送 |
| [electron-builder](https://github.com/electron-userland/electron-builder) | 26.18.0 | MIT | 开发与打包 |
| [electron-updater](https://github.com/electron-userland/electron-builder/tree/master/packages/electron-updater) | 6.8.11 | MIT | 检查、下载与安装更新 |
| [lazy-val](https://github.com/develar/lazy-val) | 1.0.5 | MIT；作者 Vladimir Krivosheev | 更新模块的延迟加载依赖 |
| [Playwright](https://github.com/microsoft/playwright) | 1.62.1 | Apache-2.0 | 桌面回归测试 |

Electron、Lucide 和 Nodemailer 的上游许可文本保存在 [docs/licenses](docs/licenses)。Electron 运行环境发行包还保留 `LICENSE.electron.txt` 和 `LICENSES.chromium.html`，不要从分发文件夹中删去。

electron-updater 及 lazy-val 的许可说明也保存在 `docs/licenses`。随应用分发的其他生产依赖包括 fs-extra、graceful-fs、jsonfile、universalify、js-yaml、argparse、lodash.escaperegexp、lodash.isequal、semver、tiny-typed-emitter、builder-util-runtime、debug、ms 和 sax；各自包目录中保留上游许可证，准确版本以锁文件为准。lazy-val 的 npm 包仅声明 MIT，另附标准 MIT 许可文本与包内作者信息。

课程抓取按学校页面协议独立实现。字段核对参考 [SEUTimetable 的提取脚本](https://github.com/sakimidare/SEUTimetable/blob/dev/app/src/main/assets/timetable_extractor.js)；本仓库没有打包该项目代码，也不表示学校或上游项目提供官方支持。

内置背景为按项目需求制作的生成插画。参考截图、学校账号和用户提供的个人资料不随仓库分发。README 中的演示任务为虚构内容，不会写入终端用户首次启动的日程。
