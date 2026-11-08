# DEPENDENCIES.md · 「微缩营地巡游」项目依赖统计

> **定位**：本项目依赖统计文档（对应原文十.3 L147）：统计本项目引入的**全部依赖及其大小**——项目内依赖（package.json 的 dependencies/devDependencies、node_modules 与 pnpm 虚拟仓库体积）与写入系统仓库的依赖（pnpm/npm 全局包及其位置）；**每当依赖发生变化时同步更新本文件**，记录名称/版本/用途/体积，便于统计磁盘空间去向。
> **硬性流程（九.1 L128 + 十.3 L147）**：下表当前全部为**「计划引入·未安装」**状态——DESIGN.md 经用户审阅通过、且用户批准本依赖表之前，**禁止执行任何 `pnpm install` / `pnpm add`**；此后每次依赖变化（新增/删除/升级/换用途）必须**先更新本文件并获同步确认，再动 package.json**。
> **体积口径**：标注「预计」的数值为设计估算（来源注明），实装后以 §4 的实测命令结果替换并填入「实测」列；行号 L120 = 原文第八节第 1 点。

---

## 1. 环境基线（2026-11-08 实测，只读命令，未安装任何东西）

| 项 | 值 | 获取命令 | 位置 |
|---|---|---|---|
| node | **v24.19.0** | `node --version` | `C:\Program Files\nodejs\node.exe` |
| pnpm | **12.3.4** | `pnpm --version` | `C:\Users\Tom\AppData\Roaming\npm\pnpm`（全局包装器） |
| npm | 11.17.0（未用于本项目，仅基线记录） | `npm --version` | `C:\Program Files\nodejs\npm` |
| 既有 npm 全局包（**7 项·既有·非本项目引入**） | @vue/cli@5.0.8、cnpm@8.4.0、json-server@1.0.0-alpha.19、miniprogram-to-uniapp@2.0.24、pnpm@12.3.4、slidev-theme-penguin@1.6.1、typescript@5.0.2 | `npm ls -g --depth=0`（2026-11-08 实测） | `C:\Users\Tom\AppData\Roaming\npm\`；pnpm 侧全局为空（`pnpm ls -g` → No global packages found）——npm 与 pnpm 全局目录不同，清单须分别采集 |
| pnpm store（虚拟仓库根） | `E:\_Dev\node\pnpm-store\v11` | `pnpm store path` | 当前占用 **1.9 GB**——为既有全局共享内容，**非本项目引入**；本项目安装后增量见 §4 |
| 项目本地 node_modules | 尚不存在（未搭建工程） | — | — |
| 项目内 git 仓库 | **已初始化**（2026-11-08 文档阶段执行；实测 2026-11-08：仅 `git init`——零提交、零远程、全部文件未跟踪。原文九.5-b 本就允许项目目录内初始化本地 git，此前本表误记「尚未初始化（九.1 门禁内）」，已更正；**请用户随审阅追认**，不追认则按九.4 红线列待清理项交用户处理，不递归删除 .git） | `git rev-parse --is-inside-work-tree`、`git log --oneline --all`、`git remote -v`、`git status --short` | `mini-camp-diorama/.git`（HEAD/config 时间戳 2026-11-08 14:45） |

> 结论：写入系统仓库的既有全局包共 **7 项**（全部 npm 侧，上表所列，**均既有·非本项目引入**）；pnpm 全局为空；本项目**不计划新增任何全局安装**（全部依赖进项目内，经 pnpm store 硬链接）。全局 typescript@5.0.2 的存在对本项目 §2.2 的 devDependency `typescript` 仅有版本参考意义，项目内仍独立安装锁定版本。（修订 2026-11-08：原结论「只有既有的 node/pnpm/npm 本体」系仅采集了 pnpm 侧清单所致，已按 `npm ls -g --depth=0` 实测更正。）

---

## 2. 计划引入的依赖表

### 2.1 runtime dependencies（运行时依赖，打包进产物）

| 名称 | 计划版本 | 用途 | 预计体积（安装 / 产物贡献） | 状态 |
|---|---|---|---|---|
| `three` | ≥0.160 近期稳定版，**安装时 `pnpm view three version` 实查后精确锁定**（16 章 §2.3；渲染章 §2.4 版本锁定要求） | 渲染引擎唯一 runtime 依赖：WebGL 渲染、MeshToonMaterial 卡通材质、Lathe/Extrude/InstancedMesh 程序化几何、examples/jsm（BufferGeometryUtils/EffectComposer 随包，不另计依赖） | 安装约 30–60 MB（node_modules，含 examples/jsm 源码）；产物 tree-shake 后贡献约 0.3–0.45 MB gzip | **计划引入·未安装** |

> three 包内的 examples/jsm 子模块（BufferGeometryUtils.mergeGeometries、UnrealBloomPass 等）随 `three` 包分发，**不构成新增依赖行**（渲染章 §6.2/§7.4）。

### 2.2 devDependencies（构建/开发期，不进产物）

| 名称 | 计划版本 | 用途 | 预计体积（安装） | 状态 |
|---|---|---|---|---|
| `vite` | 安装时最新稳定版 | dev server（内置浏览器调试走 localhost，九.2）+ 产物构建（16 章 §3） | ~20–40 MB（含 esbuild/rollup/postcss 等传递依赖；pnpm 硬链接后 store 实际新增占用按实装统计） | **计划引入·未安装** |
| `typescript` | 最新稳定 5.x | `tsc --noEmit` 类型检查（strict；四套注册表/句柄接口编译期强制） | ~60–70 MB | **计划引入·未安装** |
| `@types/three` | 与 three 主版本对齐 | three 的 TS 类型声明（若安装时 three 包已自带类型则**取消本行**并记入 §5 变更日志） | ~15–25 MB | **计划引入·未安装（视实装情况可取消）** |

### 2.3 备选依赖（未决定，引入前必须过审批）

| 名称 | 触发条件 | 用途 | 预计体积 | 状态 |
|---|---|---|---|---|
| `vite-plugin-singlefile` | 仅当用户要求「双击 dist/index.html 直接打开」（file:// 下 ES module 受 CORS 限制，16 章 §7.2） | 构建产物内联为单 HTML 文件 | 极小（构建期插件） | **备选·未决定·未安装** |

### 2.4 明确不引入清单（负面清单，防止隐性加依赖）

前端框架（React/Vue 等）、UI 组件库、图标包、three OrbitControls（自研，UI 章 U4）、独立后处理/着色库、物理/布料引擎、simplex-noise 等噪声库（自写 ~60 行）、Blender 及一切 DCC（八.2 L121 硬性禁止）、音频库（无音频需求，Q1）、linter/formatter（靠 tsc strict + review）。完整理由见 16-技术选型.md §8。

---

## 3. 预计磁盘占用汇总（设计估算，实装后替换为实测）

| 口径 | 预计 | 说明 |
|---|---|---|
| 项目 `node_modules` 表面体积 | ~130–200 MB | pnpm 符号链接结构，`du` 统计值；包体实际存放于 store |
| pnpm store 实际新增占用 | ~80–130 MB（首次安装，硬链接去重后） | `du` store 前后差值；同版本包全局只存一份 |
| `dist/` 构建产物 | ~1–2 MB（JS 主包 gzip 0.4–0.6 MB） | 无图片/字体/模型文件，全部资源运行时程序化生成 |
| 全局仓库新增 | **0** | 不做任何全局安装 |

> 诚实声明：以上均为未实装的估算；T01 执行后以 §4 命令实测回填本节与 §2 表格，届时状态列翻转并记入 §5 变更日志。

---

## 4. 体积统计方式（固定口径，每次更新依赖时照此执行）

> 全部为**只读命令**；统计不构成删除/清理动作（九.4 红线不适用，但注意不在任何清理场景中使用通配符）。项目根＝`E:/_AgentSpace/ZCode/mini_camp_lab/mini-camp-diorama/`（修订 2026-11-08：下表命令的项目路径此前漏了 `mini_camp_lab` 一级目录，已更正）。

| 统计对象 | 命令（Git Bash） | 说明 |
|---|---|---|
| 项目 node_modules 表面体积 | `du -sh "E:/_AgentSpace/ZCode/mini_camp_lab/mini-camp-diorama/node_modules"` | pnpm symlink 结构的表面值 |
| node_modules 内实际文件总量 | `find "E:/_AgentSpace/ZCode/mini_camp_lab/mini-camp-diorama/node_modules" -type f | wc -l`（文件数）+ `du -sh --dereference` 参考值 | 硬链接不重复计磁盘块 |
| pnpm 虚拟仓库（store）路径与体积 | `pnpm store path` → `du -sh "E:/_Dev/node/pnpm-store/v11"` | 全局共享；本项目增量 = 安装前后差值，安装前基线 **1.9 GB**（2026-11-08 实测） |
| store 中本项目相关包占用 | `ls "E:/_Dev/node/pnpm-store/v11" | grep -iE "three|vite|typescript"`（查 v11/files 子目录对应哈希包） | 近似定位；精确值以安装前后 store 差值为准 |
| 全局包位置与清单 | `npm root -g`、`npm ls -g --depth=0`、`pnpm root -g`、`pnpm ls -g` | 记录写入系统仓库的包（当前实测：npm 侧 7 项见 §1；pnpm 侧为空。npm 与 pnpm 全局目录不同，清单须分别采集，不可只跑一侧便下结论） |
| dist 产物体积 | `du -sh "E:/_AgentSpace/ZCode/mini_camp_lab/mini-camp-diorama/dist"` + `vite build` 输出的 gzip 明细 | 产物贡献口径 |
| 依赖树快照 | `pnpm list --depth=1`（输出存 docs/ 下当次快照或直接贴入 §5 变更日志） | 变更审计用 |

**更新触发点**（十.3）：①T01 首次安装；②任何 `pnpm add / remove / update`；③@types/three 取消或恢复；④备选依赖引入/放弃；⑤pnpm 升级或 store 位置变化。每次更新：改 §2 表格 → 跑 §4 命令回填实测 → 在 §5 追加一行变更日志 → 本地 git 提交（九.5-b，提交信息含「deps:」前缀）。

---

## 5. 依赖变更日志

| 日期 | 变更 | 版本 | 触发任务 | 审批依据 | 体积影响 |
|---|---|---|---|---|---|
| 2026-11-08 | 建档：登记 4 项计划依赖（three/vite/typescript/@types/three）+ 1 项备选（vite-plugin-singlefile），全部未安装 | — | 文档阶段 | 九.1 门禁中（待用户批准） | 无（未安装） |
| — | — | — | — | — | — |

---

## 6. 安装注意事项（T01 执行时核对）

1. **版本实查先行**：`pnpm view three version` / `pnpm view vite version`，实查结果回填 §2 表格再安装（16 章 §2.3：three ≥0.160 近期稳定）。
2. **精确锁版**：`save-exact`（或安装时 `--save-exact`），`pnpm-lock.yaml` 提交本地 git。
3. **pnpm 构建脚本审批**：pnpm ≥10 默认拦截 postinstall；esbuild（vite 传递依赖）可能触发 `pnpm approve-builds`——处理方式与结果记入 §5 变更日志；或预先在 package.json 写 `pnpm.onlyBuiltDependencies: ["esbuild"]`。
4. **engines**：`"node": ">=20.19"`（本机 24.19.0 满足）。
5. **离线复装**：依赖入 store 后可 `pnpm install --offline`；首次安装必然联网（构建期一次性，须先过 §2 审批）。
6. **禁止事项**：不全局安装任何包；不用 npm/yarn 混装；不执行任何通配符/递归删除（node_modules 异常 → `pnpm install --force` 或整体重命名 `node_modules_broken`，九.4-b）。

---

*本文件随依赖变化实时更新（十.3 L147）；与 package.json 不一致时，以先更新完成的一方为准并立即同步另一方；项目结束时保留最终版（十.0 L143）。*
