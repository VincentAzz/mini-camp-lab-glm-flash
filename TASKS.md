# TASKS.md · 「微缩营地巡游」项目任务清单

> **定位**：本项目任务清单文档（对应原文十.2 L146）：把需求拆解为可勾选任务，进入实现阶段后**实时更新状态**，九.3 L130 要求的阶段性复盘结论一并记录于本文档 §5「阶段性复盘记录」。
> **任务来源**：`docs/drafts/17-任务拆解.md`（P1–P8 共 8 阶段 48 任务，含每任务的完整内容/验收标准/原文小节对照/依赖关系——本文档是它的执行态视图，细节以 17 章为准，不在此重复；合纂后同内容见 `docs/08-任务拆解与阶段计划.md`）。
> **状态约定（四档，十.2）**：
> - `- [ ]`＝**待开始**
> - `- [ ] 🚧`＝**进行中**（复选框保持空，附注开始时间）
> - `- [x]`＝**已完成**（附注完成日期）
> - `- [ ] ⛔`＝**受阻**（必须附注原因与解除条件）
> **更新纪律**：每完成一个阶段性模块，除勾状态外，须按九.3 对照原文对应小节复盘并把结论写入 §5；任务增删/改粒度须同步回写 17 章。
> **当前状态**：文档阶段——实现文档（docs/00–09 十册分册，2026-11-08 由单一 DESIGN.md 合纂版按用户要求拆分而成；合纂版存档于 docs/drafts/DESIGN-合纂版-已拆分存档.md；分章草稿 16/17/18 等见 docs/drafts/）已于 2026-11-08 经用户审阅通过（全部 ★/待拍板项按推荐执行，详见 §6 与 PRE-8）；按用户指示实现阶段于下一会话启动，本轮仅回写拍板与备份，仍不编码不装依赖（详见 §4 与 §5 PRE 条目）。

---

## 1. 阶段总览

| 阶段 | 任务数 | 状态 | 里程碑 |
|---|---|---|---|
| P1 脚手架 | 7 | 已完成 ✅ 2026-11-08 | M1：编排可跑（达成——最小桩场景经 Director 可跑） |
| P2 公共系统 | 10 | 已完成 ✅ 2026-11-08 | M1 |
| P3 场景×4 | 5 | 已完成 ✅ 2026-11-09 | M2：默认组合真实内容合体（达成——四场景注册合拢，扩展演练证「新增场景零核心改动」） |
| P4 车型×5 | 6 | 待开始 | |
| P5 时间/天气 | 6 | 待开始 | M3：时间天气全维生效 |
| P6 UI | 6 | 待开始 | M4：UI 完整可巡游 |
| P7 动效打磨 | 5 | 待开始 | M5：性能达标 |
| P8 验收复盘 | 3 | 待开始 | M6：最终自查通过 |

---

## 2. 任务清单（状态随进度实时更新）

### P1 · 脚手架（T01–T07）

- [x] **T01 工程脚手架与依赖安装**（门禁已于 2026-11-08 解除：用户审阅通过 docs/00–09 并按推荐批准依赖表；2026-11-08 以工作流模式执行完成——typecheck 0 错 / build 冒烟通过 / grep dist 无真实外链，依赖版本与体积见 DEPENDENCIES.md、复盘见 §5.2 R-P1-1）✅ 2026-11-08
- [x] **T02 Engine 与渲染循环**（帧序/pixelRatio 钳制/dev DC 计数器/resize；src/core/engine.ts——实机渲染项按计划归 T44 实测，本轮以门禁+静态接线为据）✅ 2026-11-08
- [x] **T03 轨道相机自研**（球坐标+阻尼+Pointer Events 鼠标/触屏/边界 clamp；src/core/controls.ts——交互手感实机项归 T39）✅ 2026-11-08
- [x] **T04 注册表与状态基础设施**（Registry/AppState/EventBus/四套 types 接口含 M1–M4 句柄字段）✅ 2026-11-08
- [x] **T05 程序化资产基建**（SharedAssets 引用计数/canvasTex/geom 帮手/InstancedGroup/ToonMaterialFactory+ramp×5；2026-11-08 复跑 verify-t05t06.headless.mjs 全过）✅ 2026-11-08
- [x] **T06 onBeforeCompile 补丁冒烟**（RGB ramp/高光带/rim + customProgramCacheKey + 降级路径；风险 R1 先手；2026-11-08 复跑 verify-t05t06.headless.mjs 全过）✅ 2026-11-08
- [x] **T07 统一底座 BaseAssembler**（20×20 统一骨架 + BaseStyleSpec 消费 + 剪影板挂点；同上复跑全过；遗留：剪影板几何缓存化建议见 §5.2 R-P2-1）✅ 2026-11-08

### P2 · 公共系统（T08–T17）

- [x] **T08 RhythmClock 全局节奏源**（T_base 3s 三档/gust 函数/相位分配/禁 setTimeout）✅ 2026-11-08
- [x] **T09 WindSystem + ClothHandle**（布料顶点位移/uSag 下凹/customDepthMaterial/windFactor（M1）/植被通道）✅ 2026-11-08
- [x] **T10 ParticleSystem + EmitterSpec**（8 种 kind 参数表/GPU 池/setRate 句柄/交叉淡化）✅ 2026-11-08
- [x] **T11 LightBreathSystem + LampHandle**（steady/breath/blink/rotate(rev|sweep)（M2）/halo/glowBoost；遗留：emissiveLamp 调制链对齐见 §5.2 R-P2-1）✅ 2026-11-08
- [x] **T12 TimeLightSystem + SceneLightState**（GlobalLightParams 应用器/六通道下发/线性空间插值）✅ 2026-11-08
- [x] **T13 WeatherMaterialSystem + WeatherSurface**（7 分量共享 uniform/uSnow 遮罩/uLineFade/云影/反光条/雪壳（M4））✅ 2026-11-08
- [x] **T14 AtmosphereSystem**（D6 单通道雾合成/剪影逐层雾化/云带驱动）✅ 2026-11-08
- [x] **T15 EventScheduler**（偶发排程器 + 海鸟/松鼠/纸巾/光斑/双闪五事件参数；2026-11-08 复跑 temp-t15-t16-smoke.mjs 全过）✅ 2026-11-08
- [x] **T16 OutlineSystem**（反壳+物体级开关+实例化成对+宽度档+描边色三选一；post 接口保留不实现；2026-11-08 复跑 temp-t15-t16-smoke.mjs 全过）✅ 2026-11-08
- [x] **T17 Director + TransitionController**（装配/卸载编排/四维切换路径/FadeSwap/retarget/分帧构建；泄漏测试 20 轮——2026-11-08 门禁 tsc+vite build 全绿；临时桩场景/车型最小可跑；无头编排冒烟 60+ 断言全过，实机项归 T32/T33/T40；复盘见 §5.2 R-P2-1）✅ 2026-11-08

### P3 · 场景×4（T18–T22）

- [x] **T18 海崖 seacliff（默认场景）**（SceneModule 五部分完整；2.1.2 十五组逐组在场、7-1 七动效逐项落点、光照钩子行为表逐行——帆船四档/清晨餐具露水/黄昏串灯灯塔/夜间全亮+暖车窗光贴花、palette 12 通道、campAnchor §4.1.0 口径、重复元素 InstancedGroup、无人物；部件库首批 10 文件 waterSurface/rockCluster/benchSlat/foldTable/foldChair/clothMicro/signBoard/gardenHose/bicycle/campfire 全程序化+工厂取材；registry 已换 seacliffScene(isDefault)、_stub.ts 保留不删；153 DC≤200、4 档×4 天气合成帧回归零错误；地形落差为崖体抬升方案见 §5.2 R-P3-1①）✅ 2026-11-09
- [x] **T19 山间松林 pineforest**：12 组元素 + 7 动效（对照 2.2、7.2）（SceneModule 五部分完整于 src/content/scenes/pineforest.ts，§4.1.2 松林行 + §7.2.2 七动效逐项落点 + geom/parts/pineforest/ 部件 8 件；溪谷下拉 1.6u 受 T07 实心顶板限制采「碎石台体抬升 GRAVEL_TOP=1.6」方案（campAnchor y=groundY=1.6，x/z/heading/radius 逐字），同 R-P3-1① 口径待 T43 评审；temp-t19-smoke.mjs 冒烟脚本入库；注册合拢与本会话 `tsc --noEmit` 0 错由 T22 实测）✅ 2026-11-09
- [x] **T20 末日避难所 wasteland**：13 组元素 + 7 动效 + 治愈系红线自查（对照 2.3、7.3、一.5/一.6）（SceneModule 五部分完整于 src/content/scenes/wasteland.ts，§4.1.3 十三组 + J5 四档矩阵 + geom/parts/wasteland/ 部件 9 件；治愈系红线自查——锈而不腐/无血腥/警示牌无骷髅/残骸无乘员，无人物红线通过（文件头自述）；campAnchor §4.1.0 逐字；T20 期发现 FadeSwap 卸载清空新场景天气面注册的系统性缺陷并修补 director.ts unloadOld 重注册路径（随 17b0855 入库）；注册合拢与本会话 `tsc --noEmit` 0 错由 T22 实测）✅ 2026-11-09
- [x] **T21 高速路服务区 servicearea**：12 组元素 + 5 动效 + shopPower 通道 + 车流（对照 2.4、7.4）（SceneModule 五部分完整于 src/content/scenes/servicearea.ts，§4.1.4 十二组 + §7.1.4 shopPower 灯点总表 + §7.2.4-① 车流 B3 表 + geom/parts/servicearea/ 部件 12 件；公路下沉带 −0.12 受 T07 实心顶板限制采「路缘石高差」观感方案（campAnchor 逐字 groundY=0）；temp-t21-hook.mjs/verify-t21.headless.mjs 冒烟脚本入库；注册合拢与本会话 `tsc --noEmit` 0 错由 T22 实测）✅ 2026-11-09
- [x] **T22 场景注册表合拢 + 扩展演练**（测试场景注册→UI 自动出现→卸除，git diff 证零核心改动；对照 2.5）（①合拢：registry.ts 四场景全登记（registry.ts:14–17）、_stub.ts 保留不删待 T48；②扩展演练：临时场景 _drill_lakeside.ts（最小 SceneModule 五部分）+ registry 临时注册行 → `pnpm exec tsc --noEmit` 0 错 → test 提交 29947e1（仅 scenes/ 两文件 +85 行，src/core/ 零改动）→ `git revert --no-edit` 0fcb85e 撤销（文件由版本管理移除非手工删除）→ 撤销后 tsc 复绿；演练提交前 T19–T21 实现先前置落库 17b0855 以隔离 revert 波及。UI「自动出现」待 T35 registry 驱动分段按钮落地后按 Registry.list() 顺序自动生效（docs/01 §3.1-④），本轮以类型闭合+提交/撤销链为据；复盘见 §5.2 R-P3-2）✅ 2026-11-09

### P4 · 车型×5（T23–T28）

- [x] **T23 vehicleKit 部件库 + C型房车 classC（默认车型）**：透视内饰三件套 + 16 named + 小夜灯呼吸（对照 3.1）（VehicleModule 四项完整于 src/content/vehicles/classC.ts——外部凸头舱/升顶楔+帐帘带+收拢卷/滑出舱+风琴套+滑轨/侧窗真开洞贯通双侧+玻璃三档（types.ts 导出 GLASS_OPACITY/GLASS_NIGHT_OPACITY）、2 个 DeploymentPart（popTop/slideOut，deployAmount 1）、16 named 逐项对应 3.1-6…12、小夜灯 breath 6s depth 0.18+顶灯 steady 0.55+车内暖光点光 1.15×power×emphasis、帐帘带 ClothHandle 0.9/0.12、roofTop×3 挂点（T17 遗留②对齐：types.ts weatherSurfaces 字段+director.ts 注册/反注册/换场重注册+weatherMaterial.ts unregister）；vehicleKit 首批 6 工件 wheel/pleatedBand/rollBundle/gaugeCluster/screenPanel/booksStack 各一新文件+vehicleKit.ts 改 barrel；registry.ts 桩注册替换为 classC(isDefault)、_stub.ts 保留不删；footprint 6.4×2.6 外接半径 3.454≤4.2 仲裁口径+越界告警只告警不阻断经探针实测；冒烟 verify-t23.headless.mjs 75 断言全过（3.1-1…13 逐条/透窗视域/灯钩子三档驱动/无人形/Director 集成交换+卸载）；期间修复 core 潜伏缺陷——FadeSwap 车型交换淡入末帧写 root.y=0 致 groundY≠0 场景车型沉底（director.ts 交换收尾 placeVehicle 复位，瞬态沉浮待 T43 评审）；复盘见 §5.2 R-P4-1）✅ 2026-11-09
- [x] **T24 A型大巴 classA**：17 named/环形沙发/中岛/卫浴（对照 3.2）（VehicleModule 四项完整于 src/content/vehicles/classA.ts——外部【3.2-1…6】：主车身 profileExtrude（前上角大圆角 r0.75+贯通侧窗带一整条真开洞，texBodyA 银白 #e8ecf0+藏青裙 #24344d+金线 #c9a227）/前挡弧玻璃 ×2 tinted/贯通侧窗玻璃 ×2 clear（全车最大透视面）/车顶空调外机 ×2 格栅实例化+卫星锅 Lathe r0.34 仰 35°/侧裙储物舱门 ×4/侧遮阳棚 awningAssembly(4.2,1.9)（vehicleKit 工厂+ClothHandle+clothTop+M4 雪壳）/电动踏步双级/车尾自行车架+折叠自行车 bikeFolding（vehicleKit 新件）/轮组 ×6 后双胎；DeploymentPart ×2（awning 斜布 12° 支撑臂八字张开+step 双级伸出，deployAmount 1）；17 named 恰等自检漏键抛错（环形沙发/中岛/卫浴角舱 showerGlass/三段叠柜贯通 1.8 灯带/双铺床等，键表逐字 draft §4.3）；灯点 lightStrip steady 1.0+bedLamp breath 6s depth 0.18（裁定③：draft 5s 非 RhythmClock 三档，按 docs/05 §7.1.4 车型行口径 6s）+卫浴冷光 steady 0.25 #cfe6ee；★半径仲裁回调 9.0→7.9（footprint 7.9×2.7 外接 ≈4.175≤4.2，裁定①；4.0 营位既定非阻断告警 docs/00 一.12）；verify-t24.headless.mjs 99 断言全过（3.2-1…13 逐条/外部 24 行≥22/17 named 恰等/透窗视域/灯钩子三档/无人形扫描/Director 集成+4.0 告警只告警不阻断+卸载）；文件头裁定①…⑤如实登记（draft §4.3 坐标重叠取连贯框架②等））✅ 2026-11-09
- [x] **T25 拖挂+皮卡 trailerRig**：D4 单模块/16 named/支撑腿/遮阳棚（对照 3.3）（VehicleModule 四项完整于 src/content/vehicles/trailerRig.ts——D4 单一模块双主体：牵引皮卡（深蓝冷色、仪表冷青微光 ≤0.35、at 胎 lugCount 12）在前开路+拖挂（白主体薄荷/粉线暖舱 #9ec7bb）在后跟随；组合 footprint 8.0×2.5 外接 ≈4.19≤4.2（★docs/00 一.12 半径仲裁：draft 9.8×2.5 外接 5.1 按比例回调，裁定①；4.0 营位既定非阻断告警）；拖挂 10+皮卡 6=16 named 恰等自检（裁定②：dinetteBenchFR 单键规范化——draft「dinetteBenchF/R」含「/」破坏物体名路径查找/勾验）；DeploymentPart ×3（jackLeg 支撑腿 ×2 触地+awning 右侧展开+liftTable 可升降桌板 kind 'other'——裁定⑤ 几何在 buildExterior 存 refs、buildInterior 挂入内饰）；圆舷窗分瓣法（裁定③：上下扇区 Cylinder 各 ±55°+左右侧板带洞挤出 Shape.holes 真开洞+椭圆端面盘承担球冠读法——球面无法开洞真开洞优先）；「+0.06rad 微调」按模块侧 exterior/interior 组自转实现（裁定④：Director 持 root 旋转权不改 core——T28 归位裁定保留，见 R-P4-2）；灯光 Q6 拍板 trailerCeilLamp steady 1.0 暖 #ffb066+暖光点光为组合「车内暖光」主角、皮卡屏=screens 冷端不设灯具（3.3-12 一冷一暖车队感）；geom/parts/vehicles/trailerRig/ 部件 8 件（trailerBody/jackLeg/aFrameHitch/cargoBedLoad 等）；verify-t25.headless.mjs 101 断言全过（3.3-1…12 逐条/外部 25 行≥22/16 named/组合摆位/雪壳 clothTop 继承布面变换+幂等反注册/Director 集成+卸载））✅ 2026-11-09
- [x] **T26 B型面包车 classB**：16 named/半展开变床/串灯错相/贴纸/补建升顶（对照 3.4）（VehicleModule 四项完整于 src/content/vehicles/classB.ts——16 named 恰等自检（裁定①：§4.2.4 清单 15 键 vs「16 个 named」矛盾，以钩子清单『车内小顶灯』ceilLamp steady 0.4 补位第 16，键表如实呈报 openIssues）；半展开变床 bedCushionExt（卡座 foldTable+床垫外伸组）；串灯 ×4 相位组 blink 3s 占空 0.6 depth 0.3 stagger 0.4rad 错相（「轻快闪烁」不爆闪，同海崖串灯口径）+小顶灯 steady 0.4；贴纸 stickerDoodle+挂毯 tapestry+纱帘 gauzeCurtain 三 ClothHandle（docs/05 §7.1.2 布料行 0.4/1.0/0.05、0.9/0.12、0.35/0.12、0.6/0.12）；补建升顶 popTop（§6 遗留 2 用户拍板：楔+帐帘带+收拢卷；popTopMattress 俯视经 0.85 半透帘+收拢卷错缝读轮廓——裁定④）；后掀尾门 tailgate 70° 液压杆悬停+洞框内衬暗腔承担「掀开露舱口」（裁定③：ExtrudeGeometry 端帽无法开洞，大侧窗真开洞按 docs 点名执行）；大侧窗洞扩展 x −1.9→0.9 van 长窗带（裁定②：厨房台面透窗矛盾取连贯框架，尾段经尾门开口+纱帘二次透读）；跨车复用 overlandTruck roofRack/ledString 通用工厂（裁定⑤——T28 归位裁定保留，见 R-P4-2）；footprint 4.7×2.2 外接 ≈2.596 五车最小（半径 3.0 探针营位零告警实测）；verify-t26.headless.mjs 117 断言全过（3.4-1…12 逐条/外部 23 行=矩阵口径 16/23/16 named/半展开变床几何/串灯错相四相位/雪壳四枚/无人形/Director 集成+卸载））✅ 2026-11-09
- [x] **T27 越野皮卡 overlandTruck**：16 named/RTT 双壳/LED 串/全地形胎（对照 3.5）（VehicleModule 四项完整于 src/content/vehicles/overlandTruck.ts——16 named 恰等自检（裁定③：draft §7.3 表 14 行 crateA/B 记 2=15 组 vs §7.3/§4.2.5/§8.2 三处口径 16，补 interiorFloor 同 C 型 named 地板惯例凑足，验收脚本逐键核对）；RTT roofTent 双壳上翻外伸（五车唯一铰链翻开机构；裁定②：上翻角 +168°=180°−12° 顶，draft −165° 符号约定直接套用与下壳穿模）+遮阳幕 shadeSail 张紧斜面+登车梯 ladder 斜撑落地 三 DeploymentPart；LED 串 blink 2.5s gain 0.9 stagger 错相+小顶灯 steady 0.35+车顶探照灯 steady 0.3 不给 rotate（旋转扫动是场景探照灯专属语义）；全地形胎 vehicleKit/wheel kind 'at'（**T27 修复 wheel.ts**：18 凸块沿 +Z 径向外推再绕 Y 均布——原实现沿轴 +Y 平移致 18 只同位堆叠不构成绕周胎纹）；货斗分件拼装（裁定①：斗内开敞载物可见，x 包络 −2.6→2.6 与 draft 一致，轮廓读法等效）；**core 潜伏缺陷修复 transition.ts**：FadeMeshEntry 增 originalVisible——restore 不再恒写 visible=true（authored false 的 M4 雪壳在车型交换后闪现到下帧 wm.update 才纠正的 bug）；车顶平台 roofRack/侧网 netPanel/jerryCan/toolbox 等通用件落 geom/parts/vehicles/overlandTruck/（一车一子目录；B 型跨车复用裁定见 T26/R-P4-2）；footprint 5.2×2.3 外接 ≈2.844（帐篷外伸视觉包络 ≈6.3 不入 footprint 口径——裁定④，Director 按 footprint 核对≤海崖 4.0 不告警）；verify-t27.headless.mjs 95 断言全过（3.5-1…9 逐条/外部 32 行≥22 draft §8.2 口径 24 只增不减/16 named/布料注册/雪壳/无人形/Director 交换+卸载））✅ 2026-11-09
- [ ] **T28 vehicleRegistry 合拢 + 差异与细节量核对 + 扩展演练**（named≥16 且外部≥22 双指标；radius 契约仲裁；对照 3.6）

### P5 · 时间/天气（T29–T34）

- [x] **T29 timeRegistry 四档正式预设数据**（GlobalLightParams + 六通道 + transitionMs=1500；verify-t29t30.headless.mjs 文档逐格独立核对 pass=187 fail=0；复盘见 §5.2 R-P3-1）✅ 2026-11-09
- [x] **T30 weatherRegistry 五档正式预设数据**（lightMod/particles/material 七分量/windMul；verify-t29t30.headless.mjs 文档逐格独立核对 pass=187 fail=0；复盘见 §5.2 R-P3-1）✅ 2026-11-09
- [ ] **T31 通用装饰物状态 8 项端到端**（将熄未熄/余烬/餐具/露水/全熄/炊烟/黄昏点灯/星空月面；对照 四-1…四-4 通用面）
- [ ] **T32 时间切换端到端验收**（4 场景×4 档全矩阵、四联动、1500ms、retarget）
- [ ] **T33 天气切换端到端验收**（4 场景×5 档全矩阵、粒子交叉/材质插值/风力趋近）
- [ ] **T34 时间×天气综合光照合成核验**（合成公式 + 20 组合速查矩阵 + 三个原文示例组合复核）

### P6 · UI（T35–T40）

- [ ] **T35 ControlPanel 四组分段按钮**（registry 驱动/21 枚内联 SVG 图标/三重选中信号）
- [ ] **T36 组合标题条**（「场景 · 车型 · 时间 · 天气」格式逐字核对）
- [ ] **T37 磨砂玻璃视觉系统**（六.3 四关键词逐属性 + 深色基线 + accent 联动 + 降级）
- [ ] **T38 隐藏/呼出 UI**（状态机/H 键/ghost 把手/不持久化）
- [ ] **T39 响应式与不遮挡校准**（<720px 页签折叠/safe-area/默认机位遮挡实测）
- [ ] **T40 切换过渡 UI 端到端联调**（全链路数据流/FadeSwap 共享 uniform 重挂验证/连点策略/相机连续）

### P7 · 动效打磨（T41–T45）

- [ ] **T41 偶发动效实机调参**（五事件按 Q4 参数表调优；「静止但活着」原则）
- [ ] **T42 材质级动效统一调优**（波光/光斑/车流/光束/反光条/雪面闪点）
- [ ] **T43 三渲二观感整体调参**（ramp/描边/光照色/雾/饱和度纪律/明度秩序；一.2 逐词自查）
- [ ] **T44 性能实测与预算回填**（FPS 矩阵 ≥55fps 达标线/DC≤200 实测/降级阶梯 L0–L3 验证）
- [ ] **T45 默认组合第一眼印象定稿**（海崖·C型·黄昏·晴朗专项调优；十一.1）

### P8 · 验收复盘（T46–T48）

- [ ] **T46 400 组合巡游核验**（4×5×4×5 全组合过一遍 + 每次切换真实变化核验；十一.2）
- [ ] **T47 对照原文逐节最终自查**（一~十一节逐节核对 + 各分章对照表逐行勾验 + 断网运行验证；九.3/十一.4）
- [ ] **T48 收尾与文档回写**（三文档终版/git 提交整理/待清理项清单；九.4/九.5/十.0–十.3）

---

## 3. 受阻与门禁登记

| # | 事项 | 阻塞的任务 | 解除条件 | 登记日期 |
|---|---|---|---|---|
| G1 | 实现文档（docs/00–09 十册分册，2026-11-08 由单一 DESIGN.md 合纂版拆分而成，合纂版存档于 docs/drafts/DESIGN-合纂版-已拆分存档.md）尚未经用户审阅同意 | T01（连带其后全部任务） | 用户明确同意实现基线 | 2026-11-08 |
| G2 | DEPENDENCIES.md 依赖表（three/vite/typescript/@types/three，均「计划引入·未安装」）尚未获批准安装 | T01 | 用户批准依赖清单 | 2026-11-08 |

> 门禁解除后：T01 改 🚧 执行；执行中解除 G1/G2（本表行划掉并在 §5 记录）。

---

## 4. 文档阶段状态说明

- **当前所处阶段**：九.1 L128「理解先行、文档先行」——实现文档已产出，待用户审阅（2026-11-08 起：合纂版 DESIGN.md 已按用户要求拆分为 docs/00–09 十册分册；需求清单草稿 01–04 归档至 docs/需求清单/；设计草稿 10–18 原地保留于 docs/drafts/，合纂版整体存档未删除）。**2026-11-08 更新：用户审阅通过并拍板全部 ★/待确认项（详见 §6 与 PRE-8），实现阶段待下一会话启动。**
- **门禁内的禁止事项**：编码、脚手架搭建（package.json 等）、依赖安装——全部等用户同意。**更正（2026-11-08）**：`git init` 不在九.1 门禁内（原文九.5-b 明确允许项目目录内初始化本地 git）；本地仓库实际已于文档阶段 2026-11-08 初始化——仅初始化，零提交/零远程/全部文件未跟踪（实测 `git log --oneline --all` 为空、`git remote -v` 为空、`git status --short` 全为未跟踪），本节此前把 `git init` 误列为「门禁内禁止事项」，已更正并登记追认项（§6-7）。
- **文档阶段复盘条目位置**：见 §5 复盘记录表中编号 `PRE-#` 的条目（文档阶段即发生的决策/悬置项登记于此，实现阶段条目编号 `R-<阶段>-#`）。

---

## 5. 阶段性复盘记录（表结构先行，随进度填写）

> 按 2.5/3.6/七.x/八.x 等原文小节逐条核对后在此登记；「结论」只写达成/偏差/遗留三态与一句话说明，详细勾验留在各任务验收记录。

### 5.1 复盘条目

| 编号 | 日期 | 阶段/任务 | 对照原文小节 | 复盘结论（达成/偏差/遗留） | 后续动作 |
|---|---|---|---|---|---|
| PRE-1 | 2026-11-08 | 文档阶段（需求核对） | 一~十一节（01–04 清单） | 达成：四份需求清单逐条归纳完毕，存疑点共 38 条已分流至各章拍板（D1–D8 8 条、J1–J8 8 条、B1–B11 11 条、U1–U6 6 条、Q1/Q2/Q3/Q5/Q6 5 条；Q4=动效参数定值已由 docs/05-时间天气动效.md §7.1 参数表〔原 DESIGN 第七章〕承担、不设行），另有 ★-冲突修正 17 处（D8/J4/J5 及 ★-行 14 条）随 docs/00-需求理解与核对.md 一.12 交用户确认，两表合计 52 行（本行原记「存疑点共 28 条」与实际不符，重数更正） | DESIGN.md 合并时以「接口变更决议表」集中呈报用户（现为 docs/01-整体架构.md §3.9） |
| PRE-2 | 2026-11-08 | 文档阶段（架构） | 2.5、3.6、八.4 | 达成：四套注册表互相独立、六项公共系统划分、句柄交汇面四类型落定（10-架构 §3–§4） | M1–M4/P1–P4 接口微调合并 DESIGN.md 后须回写 10-架构.md |
| PRE-3 | 2026-11-08 | 文档阶段（任务拆解） | 九.1 ⑧、十.2 | 达成：8 阶段 48 任务拆解完毕，每任务含验收标准与原文对照；执行态由本文件管理 | 进入实现阶段后按 17 章 §10 里程碑节奏勾选 |
| PRE-4 | 2026-11-08 | 文档阶段（依赖） | 八.1、十.3、九.1 | 达成：依赖清单（3+1 项 + 1 备选）全部「计划引入·未安装」；环境基线（node 24.19.0 / pnpm 12.3.4）已实测记录 | T01 安装时实查版本回填 DEPENDENCIES.md |
| PRE-5 | 2026-11-08 | 文档阶段（风险） | 八.3、十一 | 达成：21 条全局风险分级登记，10 项取舍明示，风险→任务映射建毕 | 实现期新风险回写 18 章 |
| PRE-6 | 2026-11-08 | 文档阶段（DESIGN 九项必备内容核对） | 九.1（九项必备内容） | 达成：九项齐全、无欠缺——①需求理解与要点清单=一·章 §1.1–1.12（对照原文一~十一节逐条归纳）、②技术选型与理由=二·章 §2.1–2.10、③整体架构设计（四套注册表与公共系统划分）=三·章 §3.3–3.4、④四维模块实现方案=四·章（逐场景 §4.1.1–4.1.4、逐车型 §4.2.1–4.2.5、时间 §4.3、天气 §4.4）、⑤三渲二渲染方案=五·章 §5.1–5.8（卡通材质/渐变色阶 §5.2、描边 §5.3，光照预设与过渡另在 §4.3.2/§4.3.5）、⑥UI 与切换过渡=六·章 §6.1–6.10、⑦动效清单=七·章 §7.1–7.2、⑧任务拆解与阶段计划=八·章 §8.1–8.11、⑨风险与取舍=九·章 §9.1–9.9 | DESIGN.md 整体待用户审阅通过后方可进入实现阶段（九.1 门禁） |
| PRE-7 | 2026-11-08 | 文档阶段（文档结构重组） | 九.1（九项必备内容）、十.0、十.1 | 达成：按用户要求将单一 DESIGN.md 合纂版（1827 行）重组为分模块多文档——docs/00–需求理解与核对 / 01-整体架构 / 02-场景模块 / 03-车型模块 / 04-三渲二渲染 / 05-时间天气动效 / 06-UI与交互 / 07-技术选型 / 08-任务拆解与阶段计划 / 09-风险与取舍 共十册（内容逐段保留，章内编号原样，跨章引用改指新路径）；九项必备内容映射核对结论：**齐全无遗漏**——①→00 分册+docs/需求清单/ 四份、②→07、③→01、④→02+03+05、⑤→04、⑥→06、⑦→05（§7）、⑧→08+本文件、⑨→09；合纂版整体移动存档为 docs/drafts/DESIGN-合纂版-已拆分存档.md（**仅移动未删除**，顶部加存档说明，行号仍供评审记录 F1-F11 引用）；需求清单草稿 01–04 移入 docs/需求清单/（文件名不变），草稿 10–18 原地未动；项目根新增 README.md（文档地图/阅读顺序/九项映射/待拍板项摘录/待清理项说明） | 待用户审阅 docs/00–09；审阅通过前维持九.1 门禁（不编码不装依赖）；草稿 10–18 与存档合纂版去留待用户日后决定 |
| PRE-8 | 2026-11-08 | 文档阶段（审阅回写） | 九.1（审阅门禁）、十.1 | 达成：用户通读 docs/00–09 全部文档，结论「完成度高、无必要修改意见，一切按文档推荐处理」；全部 ★/待拍板项按推荐拍板——Q6 接受 55fps 口径（1080p 稳定 ≥55fps、1% low ≥40 视为达成 60fps 目标）、D8 采纳照明二分法（附加性能兜底：实测吃紧可降级白天商业照明全灭）、★-B型升顶认可补建、遗留项 1/6/7 一并确认（接口决议表按 §3.9 执行、singlefile 保留备选默认不引入、本地 git 追认）；拍板决议已回写 docs/00 一.12、八个分册引用头、README §四 | 实现阶段按用户指示于下一会话以工作流模式启动；本轮不编码不装依赖 |

### 5.2 实现阶段复盘条目（进入编码后使用，编号 `R-<阶段>-#`）

| 编号 | 日期 | 阶段/任务 | 对照原文小节 | 复盘结论（达成/偏差/遗留） | 后续动作 |
|---|---|---|---|---|---|
| R-P2-1 | 2026-11-08 | P1+P2 / T02–T17 基建与公共系统总装 | 八.5、八.4、一.3、六.5、四-5、五-6、D5 | 达成：T02–T07（engine 帧序/轨道相机/Registry·AppState·EventBus·四套 types/SharedAssets·canvasTex·InstancedGroup·ToonMaterialFactory/补丁冒烟/统一底座）+ T08–T16（clock/wind/particles/lightBreath/timeLight/weatherMaterial/atmosphere/scheduler/outline 十套公共系统）+ T17（Director+TransitionController：装配/卸载编排、四维切换路径、FadeSwap 材质克隆+分帧≤3、retarget、离散中点切换+0.2s 淡入、20 轮泄漏测试）全部实现；**门禁全绿**：`pnpm build`（tsc --noEmit 0 错 + vite build）2026-11-08 复跑通过；T05/T06/T07 复跑 verify-t05t06.headless.mjs＝ALL CHECKS PASSED、T15/T16 复跑 temp-t15-t16-smoke.mjs＝ALL PASS（node registerHooks 解析 '@/…'）；T17 另有无头编排冒烟 60+ 断言全过（临时桩场景/车型经 Director：默认组合首帧直呈不播过渡、时间 retarget 无跳变、天气粒子/风力/七分量插值收敛、场景/车型 600ms FadeSwap 时间线、队列深度 1 后到覆盖、footprint 越界告警、20 轮场景×车型交替交换 assets/发射器/灯点计数零漂移、dispose 清零）。如实注记：①T02 渲染循环/T03 相机交互的实机项本轮未复测（无头无 WebGL/DOM），按计划归 T39/T44 实机验收，本轮以门禁+静态接线为据勾选；②timeRegistry/weatherRegistry 为空（T29/T30 未落），main.ts 暂以空注册表注入、Director 一次性告警降级运行；③接口对齐三项遗留：LightBreath 写 emissiveIntensity 对工厂 emissiveLamp（MeshBasicMaterial）无视觉效果（T11/T05）、VehicleModule 缺 weatherSurfaces 产出字段（docs/03 §4.2 vs T04 types，T23 对齐）、clothTop uSnow 不达 wind 克隆材质（T13/T09，建议走 snowShell）；④baseAssembler 剪影板 PlaneGeometry 直建不经 SharedAssets、卸载无 dispose（T07 小额口径外泄漏，建议缓存键化） | T18 起按计划推进（P3/P4 可并行）；实机验收落 T39/T40/T44；四项遗留分别在 T23/T29/T30 及后续对齐任务处理 |
| R-P3-1 | 2026-11-09 | P3+P5 / T18 海崖场景+部件库首批、T29/T30 时间天气预设数据 | 2.1、2.5、7-1、四-1…四-4、五-1…五-5、§4.3.2、§4.4.1、§4.1.0 | 达成：T18 SceneModule 五部分完整——地形（崖缘曲线+小海湾+湾水湾沙+海面 water 原型+2 层 additive 波光面+之字石阶）、2.1.2 十五组逐组在场、7-1 七动效逐项落点（布料/粒子/灯点只注册句柄+参数，docs/01 §3.4 归属裁定）、光照钩子行为表逐行（帆船四档位置表、清晨餐具+露水、黄昏串灯+灯塔 dusk 0.4/night 1.0、夜间全亮+泊港桅灯+暖车窗光贴花 0.35×interiorGlow）、palette 12 通道+baseFog 0.10、campAnchor §4.1.0 口径、重复元素 InstancedGroup（礁石12/草簇20/串灯14泡/栈道36板/护栏14桩/台阶22）、无人物红线自查通过；部件库首批 10 文件（waterSurface/rockCluster/benchSlat/foldTable/foldChair/clothMicro/signBoard/gardenHose/bicycle/campfire）全程序化+ToonMaterialFactory 取材；registry.ts 已换 seacliffScene(isDefault)（_stub.ts 保留不删）。T29/T30 四档/五档正式预设数据落地（timeRegistry dawn/day/dusk/night+六通道+transitionMs 1500；weatherRegistry clear/cloudy/rain/fog/snow+lightMod/particles/material 七分量/windMul）。**门禁全绿**：`tsc --noEmit` 0 错 + `vite build` 2026-11-09 复跑通过；`verify-t29t30.headless.mjs`（期望值逐格自 docs/05 §4.3.2/§4.4.1 独立转写）＝ALL CHECKS PASSED pass=187 fail=0；T18 另经内置浏览器 dev 钩子合成帧驱动（4 档×4 天气×过渡 blend 0→1 两轮）+ renderer.render 实测：153 DC ≤200、console.error/window.onerror 零捕获、帆船四档坐标/灯塔 0.4↔1.0/暖光贴花 0.35×interiorGlow/餐具 dawn 淡入逐项核过。如实注记：①海面下沉 −2.6 依赖底座顶板开孔而 T07 顶板为整版实心 Box，T18 采用崖体抬升方案（草坪台体 +1.2、海面 0.30/湾水 0.50/湾沙 0.62；campAnchor.position.y/groundY=1.2 为对 §4.1.0 表唯一偏差，x/z/heading/radius 逐字），正式修法待 T22/T43 顶板开孔/下沉层声明契约评审；②工厂 water 原型 fog uniforms 缺失（T05 遗留：buildWater ShaderMaterial fog:true 未并入 UniformsLib.fog，scene.fog 挂载后首帧渲染抛 TypeError 已实测复现）——已在 geom/parts/waterSurface.ts ensureFogUniforms 部件侧按引用兜底，待 T05/T43 回写工厂后移除；③LightBreath 注册期快照 authored emissiveIntensity 基值（authored 0 恒暗，T17 桩即此写法），T18 各灯按 1.3~1.5 authored，建议 T23–T28 统一核对纪律；④场景发射器锚点固定 campAnchor 且 setRate 未暴露给场景 lightHooks——steam rate 固定 2.6（白天值）、drip rate=0 占位，smokePower/天气门控调制待 Director/T33 接 emitterHandles；⑤露水 uDew/布面窄带属 T13/T43 材质层（T18 以 52 sparkle 1 DC 近似）；⑥早餐餐具 tableware.ts/treePine 零星松树/tex/signageTexts.ts 集中常量表三项因文件白名单未拆、内联于 seacliff.ts（T19/T20 复用时抽离）；⑦内置浏览器 IAB 后台 rAF 冻结致 T18 截图核对未完成（§6.7 注记 8 同源，行为验证以合成帧替代） | T19/T20/T21 按计划推进；①待 T22/T43、②待 T05/T43、③待 T23–T28、④待 T33、⑤待 T13/T43；实机观感归 T39/T44 |
| R-P3-2 | 2026-11-09 | P3 / T19–T22 三场景实现+注册表合拢+扩展演练 | 2.2、2.3、2.4、2.5、7.2、7.3、7.4、§4.1.0、§3.3.2、§3.1-④、一.5/一.6 | 达成：T19 松林（12 组+7 动效，碎石台体抬升 GRAVEL_TOP=1.6，部件 8 件）、T20 避难所（13 组+7 动效，治愈系红线自查通过，部件 9 件；并修补 director.ts FadeSwap unloadOld 清空新场景天气面注册的系统性缺陷——unloadOld 后按新会话重注册 weatherSurfaces）、T21 服务区（12 组+5 动效+shopPower+车流，路缘石高差方案，部件 12 件）全部落地；registry.ts 四场景全登记（registry.ts:14–17），_stub.ts 保留不删待 T48。**campAnchor 终稿表**（position/headingRad/groundY/radius 实际值，采集自四场景 buildTerrain 返回值与文件内常量）：<br>① seacliff 海崖：(0, **1.2**, 0.8) / **+0.3** / **1.2** / **4.0**——y=groundY=LAWN_TOP 崖体抬升方案（R-P3-1①），x/z/heading/radius 逐字 §4.1.0；<br>② pineforest 松林：(0.4, **1.6**, 0.2) / **+0.2** / **1.6** / **4.0**——y=groundY=GRAVEL_TOP 抬升裁定，x/z/heading/radius 逐字；<br>③ wasteland 避难所：(0, **0**, 0) / **−0.4** / **0** / **4.0**——§4.1.0 逐字（车头朝围墙开口 +z）；<br>④ servicearea 服务区：(0, **0**, 3.4) / **0** / **0** / **4.2**——§4.1.0 逐字（LOT_Y=0）。<br>**扩展演练（零核心改动证据链）**：新建 src/content/scenes/_drill_lakeside.ts（最小 SceneModule 五部分，id 'lakeside'）+ registry 临时注册行 → `pnpm exec tsc --noEmit` 0 错（首轮抓出 noUnusedParameters 1 处即改即绿）→ test 提交 **29947e1**（`git show --stat`：仅 src/content/scenes/ 两文件 +85 行，**src/core/ 零改动**）→ `git revert --no-edit` 撤销提交 **0fcb85e**（_drill_lakeside.ts 由版本管理移除、可自 29947e1 恢复，非手工删除）→ 撤销后 tsc 复绿、工作区干净。**门禁**：`pnpm exec tsc --noEmit` 本会话三轮实测（T19–T21 基线 / 挂演练注册 / 撤销后）均 0 错。如实注记：①演练提交前 T19–T21 实现未落库，为免 revert 波及三场景实现，先以 17b0855（feat: T19–T21 三场景实现+注册表合拢）前置提交隔离，再执行演练两笔——偏离 ask 字面顺序（ask 预设演练前树是干净的）但保住全部实现，特此登记；②T19 溪谷下拉 1.6u / T21 公路下沉 −0.12 与 R-P3-1① 同源（T07 实心顶板无开孔），抬升/高差方案已登记，契约评审归 T43；③T19–T21 的 4×4 合成帧/DC 回归（T18 口径）本轮未复跑，冒烟脚本 temp-t19-smoke.mjs / temp-t21-hook.mjs / verify-t21.headless.mjs 已随 17b0855 入库；④「UI 自动出现」验收项：P6 T35 registry 驱动分段按钮未落地，本轮以 Registry.list() 顺序契约（docs/01 §3.1-④）+ 类型闭合为据，实机勾验归 T35/T40 | T23–T28 车型按计划推进；②待 T43；③实机项归 T32/T33/T39/T44；④归 T35/T40 |
| R-P4-1 | 2026-11-09 | P4 / T23 vehicleKit 部件库首批 + C型房车 classC（默认车型；里程碑 M2：默认组合真实内容合体——海崖场景×C型×黄昏×晴朗全为正式内容） | 4.2.0、4.2.1、3.1-1…13、12 章 §2.2–§2.7/§3.1–§3.5、§7.1.4、04 章 §5.5、01 章 §3.3.3/§3.4 | 达成：T23 全量落地——①vehicleKit 首批 6 工件各一新文件（geom/parts/vehicleKit/：wheel 胎毂分几何+'at' 18 凸块 / pleatedBand 风琴褶带 uv.x 固定边约定 / rollBundle 收拢卷 / gaugeCluster 仪表+方向盘 / screenPanel 屏面 emissiveLamp+CanvasTexture / booksStack InstancedGroup 书册堆）+ vehicleKit.ts 改 barrel（T24–T28 一部件一文件+一行扩展）；②classC.ts VehicleModule 四项完整——外部（主厢/驾驶舱 profileExtrude 侧窗真开洞贯通双侧+texStripeC 双材质组贴两侧围 cap、前脸面板+前挡洞、凸头舱 cab-over、前挡弧玻璃 Cylinder 弧段 r2.6 θ0.62 仰 8° tinted、侧窗 clear ×2、升顶楔（前倾 8° 抬高 0.42）+帐帘带 pleatedBand 环形 14 褶 opacity 0.85+透光+ClothHandle(stiffness 0.9/windFactor 0.12/swayAxes y)+收拢卷 ×2、滑出舱（z 外沿 −2.10）+风琴套+滑轨 ×2+外板真窗洞 clear、轮组 InstancedGroup 成对壳（后双胎 6 位）+轮眉 ×4、把手/后视镜/尾灯/示廓灯/舱口/接驳口/排气）、DeploymentPart ×2（popTop/slideOut，deployAmount 1，静态展开态）、内饰三件套（innerShell 主厢+驾驶舱两段 BackSide 缩放 0.94/texWoodFloor oak 地板/内饰组 noOutline 不投影）、16 named 逐项对应 3.1-6…12（dashScreen/gaugeCluster/dinetteTable/dinetteBenchL/R/kitchenSink/stove/fridge/overheadCabinets/bed/nightLamp/slideoutSofa/bookshelf/books/interiorFloor/ceilLamp）、内饰灯光钩子（nightLamp breath 6s depth 0.18★docs/05 §7.1.4 + ceilLamp steady 0.55 + screens=dashScreen/gaugeCluster color 标量 0.30+0.70×power + glowTags 床垫 0.10/帘布带 0.55/innerShell 0.12 + 车窗 opacity 随 interiorPower 插值至 0.22 + 暖光点光 #ffb066 (−0.9,1.8,0) 强度 1.15×power×emphasis——D2 唯一驱动链，模块不读时间）、roofTop×3 挂点带 M4 snowShell；③T17 遗留②对齐：types.ts 增 VehicleExterior.weatherSurfaces 可选字段 + GLASS_OPACITY/GLASS_NIGHT_OPACITY 常量（12 章 §2.3『集中 types.ts 导出』落点）、director.ts stage0 收集/stage1 注册/unloadVehicle 反注册/activateScene 换场重注册、weatherMaterial.ts 新增 unregister（对称 register）；④registry.ts 桩注册替换为 classC(isDefault true，label『C型房车』)，_stub.ts 保留不删待 T48。**门禁全绿**：`pnpm exec tsc --noEmit` 0 错 + `pnpm build`（vite build）2026-11-09 通过；新增 verify-t23.headless.mjs（registerHooks+ts.transpileModule 无头钩子）75 断言全过——3.1-1…13 逐条在场、footprint 6.4×2.6 外接半径 3.454≤4.2 仲裁口径且≤海崖 4.0 不告警、半径 3.0 探针营位触发「[vehicle] footprint exceeds camp radius」只告警不阻断、透窗视域 6 组陈设+高柜贴远墙、灯钩子三档驱动（power 1/0.85/0 逐档核值）、无人形几何名称扫描零命中、三角形 23.3k≤45k、Director 集成（装配对位/车型交换/场景交换重注册/告警/卸载）。如实注记：①draft 12 章 §3.3 内饰表 y 值彼此矛盾（地板 y1.06 与 fridge/吊柜/床铺重叠等），取连贯框架落地（地板 y=0.66+家具学常规高度），框架性偏差见 classC.ts 文件头裁定①；②『主厢左壁挖洞』以滑出舱体+风琴套+滑轨组合承担接缝读法（真开洞仅 docs/03 点名的侧窗贯通洞），滑出舱外板另开真窗洞+clear 玻璃保证 slideoutSofa 透窗可见，裁定②登记；③core 潜伏缺陷修复：FadeSwapRunner 车型交换淡入末帧写 root.y=0（绝对值）致 groundY≠0 场景车型沉底（T17 潜伏——当年仅 groundY=0 桩交换），director.ts updateTransitions 交换收尾补 placeVehicle 终态复位，淡入 300ms 瞬态沉浮（0.35→0 绝对 lerp）仍为既有表现待 T43 transition 评审改相对抬升；④透窗/帐帘『清楚看到』实机观感截图未做（无头环境），以几何对位/透明度/视域断言为据，归 T39/T44；⑤四张贴图（texStripeC/texScreenNav/texDash/texWoodFloor）内联 classC.ts（T18 同源口径）待统一抽取；⑥temp-t23-debug.mjs 临时调试件随本提交入库（勿删待 T48 按清理流程处置） | T24–T27 车型按计划推进（复用 vehicleKit barrel）；③瞬态沉浮待 T43；④实机归 T39/T44；⑤待 T43/T48；⑥待 T48 |


> **最终自查（T47）**将在此区追加一条总表：对照提示词全文一~十一节逐节结论，并链接各分章草稿的对照总表（11 章 §7、12 章 §1、13 章 §10、14 章 §7、15 章 §10）。

---

## 6. 遗留/待用户确认项跟踪（随任务推进更新）

| # | 事项 | 出处 | 状态 |
|---|---|---|---|
| 1 | 接口变更决议表（M1–M4 / P1–P4 / 车型章 §11-10 外灯通道） | 14 章 §8.2、11 章 §8.3、12 章 §11 | **已确认（2026-11-08 用户拍板）**：按 docs/01-整体架构.md §3.9 决议表执行 |
| 2 | B 型升顶补建（3.4-6 掀顶帐帘 vs 外部清单未列） | 12 章 §11-8 | **已确认（2026-11-08 用户拍板）**：认可补建升顶（楔+帐帘带+收拢卷） |
| 3 | camp.radius 契约（车型章 ≥5.5 vs 场景章 4.0–4.2）仲裁方向 | 12 章 §11-9 / 11 章 §1.3 | T28 合拢时按场景章为准仲裁 |
| 4 | 60fps 验收口径（建议 1080p 稳定 ≥55fps / 1% low ≥40） | 13 章 §7.5 | **已拍板（2026-11-08 用户确认）**：接受 55fps 口径（1080p 稳定 ≥55fps、1% low ≥40 视为达成 60fps 目标） |
| 5 | 降雪时松林晨雾保留强度（默认 ×0.6） | 14 章 §8.3-2 | 待验收观感标定 |
| 6 | vite-plugin-singlefile（file:// 双击直开）是否引入 | 16 章 §7.2 | **已拍板（2026-11-08 用户确认按推荐）**：保留为备选、默认不引入（如实现阶段确需 file:// 直开，先更新本文件获确认再引入） |
| 7 | 本地 git 仓库已于文档阶段 2026-11-08 初始化（仅 `git init`：零提交/零远程/零跟踪文件）；三文档原「尚未初始化 / 批准前不 git init / 门禁内禁止 git init」的记载与实际不符，已更正 | DEPENDENCIES §1、TASKS §4、docs/07-技术选型.md §2.10（原 DESIGN §2.10） | **已追认（2026-11-08 用户审阅通过）**：维持本地 git 仓库；不做任何删除 |
| 8 | M1 实机冒烟环境注记：IAB webview 默认冻结 requestAnimationFrame——页内 rAF 诊断 3 秒采样 rafFiresIn3s=0（document.visibilityState 仍为 "visible"）、renderer.info.render.frame 长时间为 0、tab.screenshot() 连续报 "browser screenshot surface preparation timed out after 3000ms"；普通前台浏览器 rAF 即时运行不受影响，**非应用缺陷**（渲染仅发生在 rAF 帧序内，engine.ts setAnimationLoop）。实测处置：先经 visibility 能力 set(false→true) 唤醒合成器再截图/验证帧循环（唤醒后 frame 0→117→381、drawCalls=33，截图恢复） | M1 首屏实机冒烟（2026-11-08） | **已登记（2026-11-08）**：环境注记，不改应用代码；后续 IAB 实机冒烟（T39/T44 等）一律先执行该唤醒步骤 |

---

*本文档进入实现阶段后随进度实时更新（十.2 L146）；任务定义细节以 `docs/08-任务拆解与阶段计划.md`（合纂自 `docs/drafts/17-任务拆解.md`）为准，二者不一致时以先回写完成的一方为准并同步另一方。*
