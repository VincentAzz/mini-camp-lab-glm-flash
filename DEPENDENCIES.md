# DEPENDENCIES.md · 「微缩营地巡游」项目依赖统计

> **定位**：本项目依赖统计文档（对应原文十.3 L147）：统计本项目引入的**全部依赖及其大小**——项目内依赖（package.json 的 dependencies/devDependencies、node_modules 与 pnpm 虚拟仓库体积）与写入系统仓库的依赖（pnpm/npm 全局包及其位置）；**每当依赖发生变化时同步更新本文件**，记录名称/版本/用途/体积，便于统计磁盘空间去向。
> **硬性流程（九.1 L128 + 十.3 L147）**：下表当前全部为**「计划引入·未安装」**状态——实现文档（docs/00–09 十册分册，2026-11-08 由单一 DESIGN.md 合纂版按用户要求拆分而成，合纂版存档于 docs/drafts/DESIGN-合纂版-已拆分存档.md）经用户审阅通过、且用户批准本依赖表之前，**禁止执行任何 `pnpm install` / `pnpm add`**；此后每次依赖变化（新增/删除/升级/换用途）必须**先更新本文件并获同步确认，再动 package.json**。（**更新**：该批准已于 2026-11-08 获得——用户审阅通过并按推荐批准本依赖表；实际安装随 T01 于实现阶段执行。）
> **体积口径**：标注「预计」的数值为设计估算（来源注明），实装后以 §4 的实测命令结果替换并填入「实测」列；行号 L120 = 原文第八节第 1 点。

---

## 1. 环境基线（2026-11-08 实测，只读命令，未安装任何东西）

| 项 | 值 | 获取命令 | 位置 |
|---|---|---|---|
| node | **v24.19.0** | `node --version` | `C:\Program Files\nodejs\node.exe` |
| pnpm | **12.3.4** | `pnpm --version` | `C:\Users\Tom\AppData\Roaming\npm\pnpm`（全局包装器） |
| npm | 11.17.0（未用于本项目，仅基线记录） | `npm --version` | `C:\Program Files\nodejs\npm` |
| 既有 npm 全局包（**7 项·既有·非本项目引入**） | @vue/cli@5.0.8、cnpm@8.4.0、json-server@1.0.0-alpha.19、miniprogram-to-uniapp@2.0.24、pnpm@12.3.4、slidev-theme-penguin@1.6.1、typescript@5.0.2 | `npm ls -g --depth=0`（2026-11-08 实测） | `C:\Users\Tom\AppData\Roaming\npm\`；pnpm 侧全局为空（`pnpm ls -g` → No global packages found）——npm 与 pnpm 全局目录不同，清单须分别采集 |
| pnpm store（虚拟仓库根） | `E:\_Dev\node\pnpm-store\v11` | `pnpm store path` | T01 安装前后复测均 **1.9 GB**（本项目 24 包全部复用既有 store 内容、downloaded 0，增量≈0）——主体为既有全局共享内容，**非本项目引入**（2026-11-10 T48 终盘复测仍 1.9 G 不变） |
| 项目本地 node_modules | **已存在**（2026-11-08 T01 实装）：表面 **95 MB** / **2795 文件**，解引用参考值同为 95 MB（2026-11-10 T48 终盘复测：**100 MB** / **2804 文件**——依赖表零变化，差异为 pnpm 平台可选包/解析微差的表面值波动，见 §5 终行） | `du -sh`、`find -type f \| wc -l`、`du -shL` | `mini-camp-diorama/node_modules`（pnpm 硬链接至 store） |
| 项目内 git 仓库 | **已初始化**（2026-11-08 文档阶段执行；实测 2026-11-08：仅 `git init`——零提交、零远程、全部文件未跟踪。（**T01 复测 2026-11-08**：文档阶段已于同日 16:51–18:17 产生 3 个 `docs:` 前缀本地提交，最新 ffad1ac，零远程不变；T01 本身未做任何提交，脚手架与依赖改动待统一提交步骤。）原文九.5-b 本就允许项目目录内初始化本地 git，此前本表误记「尚未初始化（九.1 门禁内）」，已更正；**已追认（2026-11-08 用户审阅通过，维持本地仓库，不做任何删除）**） | `git rev-parse --is-inside-work-tree`、`git log --oneline --all`、`git remote -v`、`git status --short` | `mini-camp-diorama/.git`（HEAD/config 时间戳 2026-11-08 14:45） |

> 结论：写入系统仓库的既有全局包共 **7 项**（全部 npm 侧，上表所列，**均既有·非本项目引入**）；pnpm 全局为空；本项目**不计划新增任何全局安装**（全部依赖进项目内，经 pnpm store 硬链接）。全局 typescript@5.0.2 的存在对本项目 §2.2 的 devDependency `typescript` 仅有版本参考意义，项目内仍独立安装锁定版本。（修订 2026-11-08：原结论「只有既有的 node/pnpm/npm 本体」系仅采集了 pnpm 侧清单所致，已按 `npm ls -g --depth=0` 实测更正。）

---

## 2. 计划引入的依赖表

### 2.1 runtime dependencies（运行时依赖，打包进产物）

| 名称 | 计划版本 | 用途 | 预计体积（安装 / 产物贡献） | 状态 | 实测（T01·2026-11-08） |
|---|---|---|---|---|---|
| `three` | ≥0.160 近期稳定版，**安装时 `pnpm view three version` 实查后精确锁定**（16 章 §2.3；渲染章 §2.4 版本锁定要求） | 渲染引擎唯一 runtime 依赖：WebGL 渲染、MeshToonMaterial 卡通材质、Lathe/Extrude/InstancedMesh 程序化几何、examples/jsm（BufferGeometryUtils/EffectComposer 随包，不另计依赖） | 安装约 30–60 MB（node_modules，含 examples/jsm 源码）；产物 tree-shake 后贡献约 0.3–0.45 MB gzip | **已安装**（实查 latest=0.187.0，满足 ≥0.160；`pnpm add -E` 精确锁定） | 零传递依赖（`pnpm list --depth=1`）；包内无 types/typings 字段（不自带类型 → @types/three 必装）；产物贡献见 §3 dist 实测 |

> three 包内的 examples/jsm 子模块（BufferGeometryUtils.mergeGeometries、UnrealBloomPass 等）随 `three` 包分发，**不构成新增依赖行**（渲染章 §6.2/§7.4）。

### 2.2 devDependencies（构建/开发期，不进产物）

| 名称 | 计划版本 | 用途 | 预计体积（安装） | 状态 | 实测（T01·2026-11-08） |
|---|---|---|---|---|---|
| `vite` | 安装时最新稳定版 | dev server（内置浏览器调试走 localhost，九.2）+ 产物构建（16 章 §3） | ~20–40 MB（含 esbuild/rollup/postcss 等传递依赖；pnpm 硬链接后 store 实际新增占用按实装统计） | **已安装**（实查 latest=8.3.6，精确锁定） | 传递依赖：rolldown@1.2.16、lightningcss@1.33.0、postcss@8.5.32、picomatch@4.0.7、tinyglobby@0.2.17（+fsevents 可选）；vite 8 构建内核已换 rolldown |
| `typescript` | 最新稳定 5.x | `tsc --noEmit` 类型检查（strict；四套注册表/句柄接口编译期强制） | ~60–70 MB | **已安装**（实查 registry latest=**7.0.2** 已超出本表批准的「5.x」家族——按批准范围取 5.x 最新 **5.9.3** 精确锁定；升 7.x 属依赖升级，须先改本表过审再动 package.json，十.3） | 零传递依赖 |
| `@types/three` | 与 three 主版本对齐 | three 的 TS 类型声明（若安装时 three 包已自带类型则**取消本行**并记入 §5 变更日志） | ~15–25 MB | **已安装·保留**（实查 three@0.187.0 无 types/typings 字段、不自带类型，本行不可取消；0.187.0 与 three 精确对齐） | 类型层传递依赖（仅 d.ts 引用、不进产物）：@types/webxr@0.5.24、@types/stats.js@0.17.4、fflate@0.8.3、meshoptimizer@1.1.1、@tweenjs/tween.js@23.1.3、@dimforge/rapier3d-compat@0.12.0 |

### 2.3 备选依赖（未决定，引入前必须过审批）

| 名称 | 触发条件 | 用途 | 预计体积 | 状态 |
|---|---|---|---|---|
| `vite-plugin-singlefile` | 仅当用户要求「双击 dist/index.html 直接打开」（file:// 下 ES module 受 CORS 限制，16 章 §7.2） | 构建产物内联为单 HTML 文件 | 极小（构建期插件） | **备选·未决定·未安装** |

### 2.4 明确不引入清单（负面清单，防止隐性加依赖）

前端框架（React/Vue 等）、UI 组件库、图标包、three OrbitControls（自研，UI 章 U4）、独立后处理/着色库、物理/布料引擎、simplex-noise 等噪声库（自写 ~60 行）、Blender 及一切 DCC（八.2 L121 硬性禁止）、音频库（无音频需求，Q1）、linter/formatter（靠 tsc strict + review）。完整理由见 16-技术选型.md §8。

---

## 3. 预计磁盘占用汇总（设计估算，实装后替换为实测）

| 口径 | 预计 | 实测（T01·2026-11-08） | 实测（T48 终盘·2026-11-10） | 说明 |
|---|---|---|---|---|
| 项目 `node_modules` 表面体积 | ~130–200 MB | **95 MB**（2795 文件，`du -sh`/`find -type f \| wc -l`；解引用参考值同为 95 MB） | **100 MB**（2804 文件，同口径复测） | pnpm 符号链接结构，`du` 统计值；包体实际存放于 store。低于估算下限：vite 8（rolldown 内核）依赖面精简且全部 store 复用。T48 终盘依赖表零变化（package.json/pnpm-lock.yaml 自 T01 提交 77df2bf 后未动，git log 证实），表面值波动为 pnpm 平台可选包/解析微差 |
| pnpm store 实际新增占用 | ~80–130 MB（首次安装，硬链接去重后） | **≈0**（安装前后 `du -sh` 均 1.9 GB；24 包 resolved 全部 reused、downloaded 0） | **≈0**（`pnpm store path`→`E:\_Dev\node\pnpm-store\v11`，`du -sh` 复测 1.9 G 不变） | `du` store 前后差值；同版本包全局只存一份。本轮所需包已全部在既有共享 store 中 |
| `dist/` 构建产物 | ~1–2 MB（JS 主包 gzip 0.4–0.6 MB） | **520 KB**（`du -sh`；`vite build` 输出：JS 526.29 kB min / **130.47 kB gzip** + index.html 0.98 kB） | **1.1 MB**（3 文件；`pnpm build` 输出：JS **1,108.69 kB min / 306.01 kB gzip** 单 chunk + CSS 6.84 kB / 2.07 kB gzip + index.html 1.06 kB；400 组合全量内容） | 无图片/字体/模型文件，全部资源运行时程序化生成。终盘 306 kB gzip 超出预估区间上限（0.4–0.6 MB 为 min 口径预估，306.01 kB gzip 在其内）；单 chunk 是否 code-split 交用户决策（非红线，TASKS §6 #12） |
| 全局仓库新增 | **0** | **0**（T01 后复测：`pnpm ls -g` 为空；`npm ls -g --depth=0` 仍为 §1 所列既有 7 项，无增减） | **0**（依赖表零变化，无安装动作发生） | 不做任何全局安装 |

> 诚实声明：以上均为未实装的估算；T01 执行后以 §4 命令实测回填本节与 §2 表格，届时状态列翻转并记入 §5 变更日志。**（2026-11-08 已执行：见上表「实测」列；§2 状态列已翻转；变更见 §5。2026-11-10 T48 终盘复测回填「实测（T48 终盘）」列，依赖表零变化。）**

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
| 2026-11-08 | 回写：用户审阅通过全部文档并按推荐批准依赖表（three / vite / typescript / @types/three 维持计划引入；vite-plugin-singlefile 维持备选默认不引入）；仍未安装 | — | 文档阶段→实现前 | 已批准（安装随 T01 于下一会话执行） | 无（未安装） |
| 2026-11-08 | **T01 首次实装**：`pnpm add -E three` + `pnpm add -D -E vite typescript@5.9.3 @types/three`（四包精确锁版，pnpm-lock.yaml 生成）。两处执行偏差如实登记：①typescript 实查 registry latest=7.0.2，超出本表批准的「5.x」家族，按批准范围取 5.x 最新 5.9.3（升 7.x 须先改本表过审，十.3）；②pnpm 12.3.4 实测不再读取 package.json 的 `pnpm.onlyBuiltDependencies`（安装输出 WARN 证实，docs/07 §2.5 与本文件 §6.3 预置写法失效），设置迁移至 pnpm-workspace.yaml（`onlyBuiltDependencies: [esbuild]`，`pnpm config get onlyBuiltDependencies` 确认生效），package.json 内失效字段已移除——pnpm-workspace.yaml 为新增工程配置文件，非依赖。T01 自验：`pnpm typecheck` 0 错；`pnpm build` 通过（JS 526.29 kB min / 130.47 kB gzip）；`grep -rE "https?://" dist/` 仅 2 处命中且均为 w3.org 命名空间标识符（favicon SVG 的 xmlns 与 three 内部 createElementNS 常量），非网络请求、无真实外链 | three 0.187.0 / vite 8.3.6 / typescript 5.9.3 / @types/three 0.187.0 | T01 | 依赖表已批准（2026-11-08）；typescript 在批准的 5.x 家族内取最新 | node_modules 表面 95 MB（2795 文件）；store 增量≈0（前后均 1.9 GB，24 包全复用 0 下载）；dist 520 KB（JS gzip 130.47 kB，当前仅空场景） |
| 2026-11-10 | **T48 终盘核对**：依赖表**零变化**（package.json/pnpm-lock.yaml 自 T01 提交 77df2bf 后未动，`git log --oneline -- pnpm-lock.yaml package.json` 证实仅此一笔）；§4 口径全量复测回填 §3「实测（T48 终盘）」列——node_modules 表面 100 MB/2804 文件、store 1.9 G 不变、dist 1.1 MB（JS 1,108.69 kB min/306.01 kB gzip 单 chunk+CSS 6.84 kB/2.07 kB gzip+index.html 1.06 kB，400 组合全量内容）、全局包仍为既有 7 项零新增（无任何安装动作）；断网核验同日复跑：dist 外链 grep 仅 3 处 w3.org 命名空间标识符（favicon SVG xmlns×2+three createElementNS 常量×1），非网络请求、无真实外链；`pnpm list --depth=1` 快照：three@0.187.0 + typescript@5.9.3（零传递）+ vite@8.3.6（rolldown 1.2.16/lightningcss 1.33.0/postcss 8.5.32/picomatch 4.0.7/tinyglobby 0.2.17/fsevents 可选）+ @types/three@0.187.0（类型层 @types/webxr 0.5.24/@types/stats.js 0.17.4/fflate 0.8.3/meshoptimizer 1.1.1/@tweenjs/tween.js 23.1.3/@dimforge/rapier3d-compat 0.12.0），共 16 包——与 T01 在册口径一致 | —（无版本变化） | T48 | 依赖表已批准（2026-11-08），十.3 触发点①–⑤均未发生新变更 | dist 520 KB→1.1 MB（内容合体后）；node_modules 表面 95→100 MB；store/全局零变化 |
| — | — | — | — | — | — |

---

## 6. 安装注意事项（T01 执行时核对）

1. **版本实查先行**：`pnpm view three version` / `pnpm view vite version`，实查结果回填 §2 表格再安装（16 章 §2.3：three ≥0.160 近期稳定）。
2. **精确锁版**：`save-exact`（或安装时 `--save-exact`），`pnpm-lock.yaml` 提交本地 git。
3. **pnpm 构建脚本审批**：pnpm ≥10 默认拦截 postinstall；esbuild（vite 传递依赖）可能触发 `pnpm approve-builds`——处理方式与结果记入 §5 变更日志；或预先在 package.json 写 `pnpm.onlyBuiltDependencies: ["esbuild"]`。（**修订 2026-11-08 T01**：pnpm 12.3.4 实测不再读取 package.json 的 pnpm 字段，改为在 pnpm-workspace.yaml 写 `onlyBuiltDependencies: [esbuild]`，已生效；详见 §5。）
4. **engines**：`"node": ">=20.19"`（本机 24.19.0 满足）。
5. **离线复装**：依赖入 store 后可 `pnpm install --offline`；首次安装必然联网（构建期一次性，须先过 §2 审批）。
6. **禁止事项**：不全局安装任何包；不用 npm/yarn 混装；不执行任何通配符/递归删除（node_modules 异常 → `pnpm install --force` 或整体重命名 `node_modules_broken`，九.4-b）。

---

*本文件随依赖变化实时更新（十.3 L147）；与 package.json 不一致时，以先更新完成的一方为准并立即同步另一方；项目结束时保留最终版（十.0 L143）。*
