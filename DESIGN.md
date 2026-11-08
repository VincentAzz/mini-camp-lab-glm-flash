# 「微缩营地巡游」实现文档（DESIGN）

> **文档定位**：本文件是《A-多场景房车营地小玩具-完整提示词》（下称「原文」，唯一事实来源）第九.1 规定的第一阶段产出——实现文档（实现基线草案），由 `docs/drafts/` 下 01–04 需求清单与 10–18 分章草稿合并而成，**提交用户审阅**。按原文九.1：本文档经用户审阅并获明确同意之前，**不进行任何编码、脚手架搭建或依赖安装**；本文所列全部依赖均处「计划引入·未安装」状态。审阅修改意见先回写本文档完成修订，再继续推进（十.1）。
> **术语约定**：全篇接口名与系统名以第三章（整体架构）为准——`SceneModule` / `VehicleModule` / `TimePreset` / `WeatherPreset` / `Registry` / `Director` / `TransitionController` / `BaseAssembler` / `ToonMaterialFactory` / `OutlineSystem` / `RhythmClock` / `WindSystem` / `ParticleSystem` / `LightBreathSystem` / `TimeLightSystem` / `WeatherMaterialSystem` / `AtmosphereSystem` / `EventScheduler` / `SharedAssets`；四类句柄 `ClothHandle` / `LampHandle` / `EmitterSpec` / `WeatherSurface`。引用规则：`一·3` = 原文第一节第 3 点；`2.1.2-③` = 第二节 2.1 元素清单第 3 项；`7.1-④` = 第七节第 1 点第 4 项。
> **默认组合**：「海崖 · C型房车 · 黄昏 · 晴朗」（原文开头段 L3、十一.1）；巡游总量 4 场景 × 5 车型 × 4 时间 × 5 天气 = **400 组合**。
> **草稿间冲突修正**：合并时共修正 17 处草稿间/草稿与原文的矛盾（以原文为最高准则；D8/J4/J5 三条拍板行 + ★-行 14 条），逐条记录于一.12「存疑点与统一拍板汇总」表中的「冲突修正」标记，并在本文档交付说明中汇总。

---

## 一、需求理解与要点清单

本章合并 01–04 四份需求核对清单，对照原文一～十一节逐节归纳，**硬性需求一条不丢**，保留原文小节编号。

### 1.1 第一节 整体形式与美术总纲（一·1～一·6）

- **一·1** 形式：网页端交互式三维小玩具（微缩模型陈列盒）；第三视角环绕观察，自由拖拽旋转、滚轮缩放观看，触屏同样支持。
- **一·2** 画面风格为三渲二：高精细建模、三渲二卡通渲染、清晰的轮廓线（描边明确）、细腻但简洁的材质层次、材质表现干净、色彩柔和但富有层次感，强调浓厚的日式二次元动画氛围与二次元夏日旅途场景感。
- **一·3** 每个场景的地面都为一个**完整的正方形底座**，所有元素都搭建在这个底座上；构图紧凑、层次清晰，小巧、精致、可收藏的模型感；不同场景仅更换底座的材质与边缘处理，「微缩底座」形式统一。
- **一·4** 一套轻量 UI 控制界面切换场景/车型/时间/天气（详见六）；除这套 UI 外画面不出现其他 HUD 类杂乱元素，模型本体保持纯净陈列感；提供「隐藏 UI」入口回到纯观赏模式。
- **一·5** 整体气质：安静、治愈、带一点旅途黄昏的辽阔孤独感但依然温暖，像一幕幕被定格下来的日本动画场景模型；**适用于所有场景，包括末世**——末世也要画得干净、有秩序感与生活气息，不追求写实血腥或恐怖。
- **一·6** **不要人物**；生命的温度全部由场景道具、车内陈设与动效承载。

### 1.2 第二节 场景系统（二·导言 + 2.1–2.5）

- **二·导言**：首发 4 个场景，架构上可继续扩展；场景与车型、时间、天气**完全解耦**——任何车辆可停任何场景的中央营位，任何场景可在任何时间与天气下观看；每个场景 = 正方形底座 + 环境元素 + 场景专属动效 + 场景专属色彩基调（色彩基调再被时间与天气系统调制）。
- **2.1 海崖营地（默认场景）**
  - 2.1.1 地形构图：悬崖草坪上的**临崖营位**，车辆位于底座视觉中心；营地不需要太大，但必须有明确的「临崖观海」构图，日本动画夏末旅行一幕。
  - 2.1.2 营地元素 **15 组全部实现**：①遮阳天幕与折叠桌椅、②串灯、③烧烤炉、④野餐垫、⑤小营地灯、⑥防水地垫、⑦连接水电桩的管线、⑧营位旁的小型折叠自行车、⑨木栈道、⑩崖边护栏、⑪观景长椅、⑫路牌、⑬海草与礁石、⑭通往小海湾的石阶、⑮远处海面上的小型帆船与防波堤灯塔。
  - 2.1.3 色彩基调：日落金橙与海面蓝紫渐变层次、海面粼粼波光与天边晚霞渐变、（黄昏时）暖色车内灯光与冷色暮色海景的鲜明冷暖对比——典型日式动画公路旅行氛围。
- **2.2 山间松林营地**
  - 2.2.1 地形构图：高大层叠松林环抱的**林间空地碎石营位**，车辆居中，四周松树高低错落、树冠层叠。
  - 2.2.2 营地元素 **12 组全部实现**：①两树之间的吊床、②篝火堆与环形原木凳、③木质营位平台与林间木阶步道、④山涧小溪与跨溪小木桥、⑤指路木牌、⑥树干上的鸟屋与防熊食物储藏箱、⑦苔藓蕨类与蘑菇丛、⑧垒起的柴堆、⑨晾晒的毛巾、⑩溪边的打水桶与水瓢、⑪远处层叠山脊与山腰云带、⑫林间空隙洒下的斑驳光斑。
  - 2.2.3 色彩基调：森林绿与晨雾青白，光斑与雾气**随时间变化**；构图强调「林间静谧」。
- **2.3 末日避难所营地**
  - 2.3.1 地形构图：废土上被加固的营地，车辆停硬化地面视觉中心，四周被**工事与围墙半包围**。
  - 2.3.2 营地元素 **13 组全部实现**：①混凝土掩体与厚重的防爆门、②铁架瞭望塔与探照灯、③沙袋工事、④锈蚀集装箱与波纹铁皮围墙、⑤缠绕的铁丝网、⑥废旧汽车残骸与轮胎堆、⑦油桶与手写警示牌、⑧净水装置与冒着蒸汽的发电机、⑨拼装的太阳能板阵列、⑩旋转的雷达天线、⑪火堆上架着的油桶改造烧烤架、⑫晾衣绳上晾着的工装、⑬远处断裂的高架桥与荒废城市剪影。
  - 2.3.3 色彩基调：锈红、沙黄与混凝土灰，点缀火光与冷色荧光；构图强调「废土据点」，**依然是干净画风的治愈系末世**（呼应一·5）。
- **2.4 高速路服务区**
  - 2.4.1 地形构图：服务区一角**带划线车位的停车区**，车辆停视觉中心的**房车专用大车位**。
  - 2.4.2 营地元素 **12 组全部实现**：①加油站雨棚与加油机、②便利店与发光招牌、③门口的自动售货机（**货道排列可见**）、④电动车充电桩、⑤餐饮区明亮的大玻璃窗、⑥遮阳连廊与公共步道、⑦行道树与绿化带、⑧公路主线与护栏、⑨高速路牌与出口指示牌、⑩长椅与分类垃圾桶、⑪洗手池、⑫旗杆上飘动的小旗。
  - 2.4.3 色彩基调：柏油灰 + 便利店暖光 + 行道树绿；**夜间**以招牌灯箱、售货机灯光与主线车流灯光为主角；构图强调「旅途驿站」。
- **2.5 场景扩展能力（硬性架构要求）**：2.5.1 场景**必须**以注册表/模块化实现；2.5.2 每个场景是含**地形、道具布置、场景动效、色彩基调、光照钩子**五部分的独立模块；2.5.3 在场景注册表中登记即可被 UI 与切换逻辑识别；2.5.4 新增场景**不应修改核心渲染与切换代码**，只需新增模块并注册。

### 1.3 第三节 车型系统（三·总则 + 3.1–3.6）

- **三·总则**：首发 5 种车型，架构上可继续扩展；车型与场景解耦（任何车型可出现在任何场景中央营位）；所有车型保留两个核心特征——**「外拓展机构已展开」**与**「内部可透过车窗/帐帘清楚看到」**；不同车型的展开方式、涂装与内饰风格必须有**明显差异**；**细节量不得少于 C 型房车**；跨场景允许轻微适配（接地高度、朝向、末世场景蒙尘涂装等），**不强制**。
- **3.1 C型房车（默认车型）**：外部——升顶展开、侧拓展舱滑出、经典 C 型驾驶舱凸头造型；内部（透过升顶帐帘与大面积车窗清楚看到）——驾驶舱大屏与仪表、卡座餐桌、厨房区水槽与灶台、冰箱、吊柜、床铺与温暖的小夜灯、侧拓展舱内沙发与书架；内饰明亮温暖真实充实，与黄昏蓝调时刻室外形成鲜明冷暖对比，温馨紧凑旅居感。
- **3.2 A型大巴式房车**：外部——方正大巴车身、大面积前挡风与贯通侧窗、车顶空调外机与卫星锅、侧裙储物舱门、展开的侧遮阳棚与电动踏步、车尾自行车架与折叠自行车；内部——环形豪华沙发卡座、中岛厨房（双开门冰箱、水槽、嵌入式灶台与烤箱）、通顶吊柜与暖色灯带、木纹地板、半隔断独立卧室与双人床、小卫浴间（洗手盆与淋浴隔断可见）；「移动小公寓」暖木色豪华感，与 C 型紧凑温馨对比。
- **3.3 拖挂式房车 + 牵引皮卡**：外部——全尺寸皮卡（货斗载行李箱、备用油桶与柴火）牵引流线型白色拖挂房车；到位后支撑腿放下、遮阳棚展开、拖挂前部燃气瓶与备胎可见；内部（拖挂两侧大窗透视）——尾部横置双人床与舷窗、一侧紧凑厨房与吊柜、对坐卡座与可升降小桌板、小卫生间隔断；皮卡双排舱内可见仪表盘、中控屏与后座睡袋行李；「车队式」旅居感。
- **3.4 B型露营面包车（vanlife）**：外部——圆润紧凑复古双色面包车、车顶行李架与捆着的冲浪板、侧边遮阳棚、后掀式尾门与纱帘、车身侧面手绘小贴纸；内部（大侧窗与掀顶帐帘透视）——对坐小卡座与翻折小桌（可变床结构**半展开状态展示**）、迷你厨房（单孔灶、小水槽、迷你冰箱）、车内串灯、挂毯与小盆栽、手冲咖啡具与散落的书；慵懒随性，「自由职业者在路上」。
- **3.5 越野皮卡 + 车顶帐篷（overlanding）**：外部——升高底盘与全地形胎硬派越野皮卡、车顶行李架上**已展开**的折叠帐篷（带登车梯与帐篷边 LED 灯串）、侧边遮阳幕、货斗内油桶/水箱/工具箱/折叠桌板、车侧爬梯与车顶探照灯；内部（双排车窗透视）——驾驶舱全液晶仪表与中控大屏、后座改装休憩区（睡袋、摊开的地图、手持对讲机与杂物网兜）；硬朗整洁，「远征装备控」。
- **3.6 车型扩展能力（硬性架构要求）**：3.6-1 与场景同理做成注册表/模块化；3.6-2 每个车型模块声明四项——**外部模型、展开机构、透视内饰、内饰灯光钩子**；3.6-3 新增车型 = 新增模块并注册，不修改核心逻辑（与八.4 四套注册表互证）。

### 1.4 第四节 时间系统（四·总则 + 四-1～四-5）

- **四·总则**：时间与场景解耦，**每个场景都必须完整实现四种时间**；切换时场景的**灯光、天空、阴影与装饰物状态**都要发生对应变化，**不允许只换色调不换内容**。
- **四-1 清晨**：低角度青金色晨光、薄雾、长投影；营地灯**将熄未熄**、篝火**只剩余烬**、桌上出现**早餐餐具**、晾晒物带**露水感高光**。场景专属：海崖=朝霞与**刚刚出海的小帆船**；松林=流动晨雾与**鸟鸣般的光斑跳动**；服务区=**刚开灯的便利店**与送货小车；避难所=**刚换岗扫动的探照灯**。
- **四-2 白天**：明亮柔和正午光、干净饱和色彩、短而清晰阴影；**灯具全部熄灭**、天幕与遮阳棚投影清晰；出现炊烟、蒸汽等「白天活动」细节。
- **四-3 黄昏（默认档）**：保留原始设计核心氛围——日落金橙与海面蓝紫渐变、天边晚霞渐变、蓝调时刻、暖色车内灯光与冷色暮色海景的强烈对比。场景专属：海崖=串灯点亮、灯塔开始工作；松林=逆光剪影与金色光斑；服务区=招牌灯箱初亮、车流渐密；避难所=探照灯与警示灯启动。
- **四-4 夜间**：月光与星空主导，环境深蓝紫色；**所有灯光道具点亮并带柔和光晕**（枚举 8 项：串灯、营地灯、车内灯、灯塔光束、便利店灯箱、售货机灯带、探照灯、警示红灯）；车内暖光更突出，成为深夜温暖焦点。
- **四-5 实现要求**：时间以**「光照预设 + 装饰物状态切换」**实现；切换时有 **1～2 秒**平滑光照过渡（交叉淡入淡出），不生硬跳变。

### 1.5 第五节 天气系统（五·总则 + 五-1～五-6）

- **五·总则**：天气与场景、时间解耦，**任意组合均有效**（原文示例：「夜间小雨的末日避难所」「清晨浓雾的山间松林」「黄昏降雪的海崖」）；天气影响**光照强度、粒子效果与材质状态**三要素。
- **五-1 晴朗（默认档）**：各场景的基准表现。
- **五-2 多云**：云量增加、光照柔化、云影在地面缓慢移动、风力略增。
- **五-3 小雨**：雨丝粒子；地面湿润反光与水洼涟漪；天幕与遮阳棚布料因积水微微下凹；屋檐滴水；**夜间灯光在湿地面上拉出彩色反光**。
- **五-4 浓雾**：远景逐层雾化、灯光产生扩散光晕、景深层次被压缩，静谧朦胧感。
- **五-5 降雪**：雪花粒子缓慢飘落；**屋顶/天幕/树枝/护栏/桌椅顶部**积雪；地面覆薄雪（服务区车位划线若隐若现）。
- **五-6 实现要求**：天气粒子与材质状态切换同样平滑过渡；天气与时间叠加时取**综合光照**（夜间浓雾 = 更暗 + 更强光晕）。

### 1.6 第六节 UI 要求（六.1～六.5）

- **六.1** 轻量控制界面，分组提供四个维度切换（场景、车型、时间、天气）；每组用「图标 + 文字」的分段按钮**或**卡片列表；当前选中态清晰。
- **六.2** 顶部或角落显示当前组合标题，格式如「山间松林 · 拖挂房车 · 夜间 · 小雨」。
- **六.3** UI 风格与三渲二美术统一：半透明磨砂玻璃质感、圆角、细描边、柔和阴影、轻快的悬停/选中微动效；小巧克制、不遮挡模型主体。
- **六.4** 提供「隐藏/呼出 UI」入口，回到纯观赏模式（呼应一·4）。
- **六.5** 切换逻辑：①场景与车型切换用短暂淡入淡出/滑动过渡；②时间与天气切换用光照与粒子的平滑过渡；③相机拖拽旋转/缩放状态在切换前后保持连续，不打断观看。

### 1.7 第七节 动效要求（七·导言 + 七-1～七-5）

- **七·导言**：所有场景延续「**静止但活着**」的节奏——整体像静止而精致的三维微缩世界，带有恰到好处的细微动态。
- **七-1 海崖 7 项**：①串灯轻微闪烁、②天幕布料随风轻摆、③海面波光流动、④远处灯塔光束缓慢旋转、⑤海鸟偶尔掠过、⑥车内小夜灯呼吸明暗、⑦野餐垫上的纸巾被风轻掀。
- **七-2 山间松林 7 项**：①松针随风轻摆、②林间光斑摇曳、③溪水流光与落叶漂流、④松鼠偶尔窜过枝头、⑤吊床轻晃、⑥篝火火焰跳动与火星升起、⑦晨雾缓慢流动。
- **七-3 末日避难所 7 项**：①探照灯光束缓慢扫动、②警示红灯旋转、③天线指示灯闪烁、④发电机排出蒸汽、⑤火堆火星上升、⑥晾衣绳衣物飘动、⑦微尘在光柱中飘浮。
- **七-4 高速路服务区 5 项**：①公路主线车流灯光流动、②便利店招牌灯箱循环微闪、③售货机灯带常亮、④雨棚下小旗飘动、⑤行道树叶片轻摆。
- **七-5 通用系统**：天气粒子（雨/雪）、灯光呼吸**统一节奏**；布料类元素（天幕、吊床、挂毯、晾晒衣物、小旗）**统一受风力参数控制**，风力随天气变化。

### 1.8 第八节 技术约束与工程要求（八.1～八.5）

- **八.1** 本机已装 node 与 pnpm，使用 **pnpm** 包管理器；技术栈建议 **Vite + Three.js（TypeScript 优先）**；纯浏览器运行，**运行时不依赖网络**。
- **八.2** **严禁 Blender 及任何外部建模软件/DCC**：所有几何体代码程序化生成（基本体、Lathe/Extrude、实例化复用）；三渲二 = 卡通材质 + 渐变色阶 + 描边（反壳描边或后期描边均可）；所需贴图用 **Canvas/SVG 程序化生成**。
- **八.3** 性能目标：**中端笔记本 60fps**；重复元素（松树、礁石、集装箱、行道树、桌椅等）**实例化**，控制 Draw Call。
- **八.4** 场景/车型/时间/天气做成**四套互相独立的注册表与数据模块**（见 2.5、3.6）；公共系统（**风力、粒子、灯光呼吸、描边、时间光照预设、天气材质状态**共 6 项）沉淀为可复用模块，支持持续扩展。
- **八.5** 画布自适应窗口尺寸；交互支持鼠标与触屏（拖拽旋转、滚轮/双指缩放）。

### 1.9 第九节 工作流程要求（九.1～九.5，硬性约束）

- **九.1 理解先行、文档先行**：第一步通读全文产出详细实现文档（DESIGN.md）交用户审阅，内容至少 9 项——①需求理解与要点清单 ②技术选型与理由 ③整体架构设计（四套注册表与公共系统划分）④四维度逐模块方案（逐场景、逐车型）⑤三渲二渲染方案 ⑥UI 与切换过渡方案 ⑦动效清单 ⑧任务拆解与阶段计划 ⑨风险与取舍说明；**获明确同意前不编码、不搭脚手架、不装依赖**；审阅意见先回写文档再推进。
- **九.2 浏览器约束**：开发全程页面预览/打开/调试**仅用自带内置浏览器**（运行验证、截图、控制台调试均在内置浏览器进行）；严禁启动系统浏览器（Chrome/Edge/Firefox 等）与 `start`/`open` 类命令。
- **九.3 按需复盘**：每完成一个阶段性模块（场景/车型/系统/UI 功能）对照原文对应章节逐条核对，结论同步任务清单文档；拿不准时回原文确认；交付前对照全文逐节最终自查。
- **九.4 删除与清理红线（任何情况下不得违反）**：
  - **九.4-a** 严禁任何通配符删除指令（`*`、`Remove-Item -Recurse`、`rm -rf`、`del *` 等）；清理构建缓存/node_modules/重装依赖同样适用，不得以任何理由放宽。
  - **九.4-b** 大规模清理（node_modules、构建缓存等）不走逐一删除，也不回退通配符/递归删除：优先包管理器自修复（`pnpm install`、`pnpm install --force`）；确需隔离损坏目录用**整体重命名挪开**（node_modules → node_modules_broken）后再全新安装；或列「待清理项」交用户处理。原则：**宁可换方法，不做大规模删除**。
  - **九.4-c** 确需删除文件时逐一显式指定完整绝对路径，严禁对整个父目录一键清空。
  - **九.4-d** 删除必须移入**系统回收站**而非直接删除；无法可靠移入回收站则保留文件列「待清理项」，绝不直接删除。
- **九.5 项目目录与版本管理**：
  - **九.5-a** 所有工作收拢在当前工作目录下新建的项目子目录（`mini-camp-diorama/`，文档阶段即可先行创建）；源码、配置、构建产物与全部文档（DESIGN.md、TASKS.md、DEPENDENCIES.md 等）一律写入该目录；严禁项目文件直接写在当前工作目录；已有其他文件与目录一律不得改动、移动、删除。
  - **九.5-b** 允许项目目录内初始化**本地 git**，按合适颗粒度本地提交（脚手架完成、单场景/车型完成、公共系统完成、文档更新等各成一笔），提交信息清晰。
  - **九.5-c** **严禁**初始化/配置任何远程仓库，严禁 push 及 `gh repo create` 等一切对外发布操作；版本管理仅限本地。

### 1.10 第十节 工作过程文档要求（十.0～十.3）

- **十.0** 三份过程文档均存放于项目目录内，随进度实时更新，项目结束保留最终版。
- **十.1** **DESIGN.md**（本文档）：审阅通过后为实现基线；后续设计调整同步回写，保持文档与代码一致。
- **十.2** **TASKS.md**：进入实现阶段即建立，可勾选任务列表含四档状态（待开始/进行中/已完成/受阻）实时更新；九.3 阶段性复盘结论一并记录于此。
- **十.3** **DEPENDENCIES.md**：统计全部依赖的名称/版本/用途/体积（含 package.json 的 dependencies/devDependencies、node_modules 与 pnpm 虚拟仓库体积、写入系统仓库的全局包及位置），依赖每次变化同步更新。

### 1.11 第十一节 验收总则

- **十一.1** 打开即玩：默认呈现「黄昏海崖 C 型房车营地」作为第一眼印象（与默认组合一致）。
- **十一.2** 通过 UI 在 **4×5×4×5 = 400 种组合**中自由巡游，每次切换都有灯光、装饰与氛围的**真实变化**。
- **十一.3** 所有组合保持三渲二、日式二次元、微缩底座、小巧精致可收藏的核心特征，突出「一幕被定格下来的日本动画场景模型」观感。
- **十一.4** 交付前按第九节要求对照原文全文逐节完成最终复盘自查，确认无遗漏、无跑偏后再交付。

### 1.12 存疑点与统一拍板汇总

原文未量化/未界定处与草稿间矛盾，统一拍板如下（D=架构决策、J=场景拍板、B=时间天气拍板、U=UI 拍板、Q=遗留确认；标 ★ 者为**草稿间/草稿与原文冲突的修正记录**，随本文档交用户确认）：

| # | 事项 | 拍板 |
|---|---|---|
| D1 | 远景（帆船灯塔/山脊云带/高架桥城市）与正方形底座的空间关系（原文未规定） | 全部收纳在 20×20 底座内：下沉层（海面/溪谷/公路）+ 后缘剪影板；天空/晚霞/星空属全局背景不计入底座元素 |
| D2 | 车内灯驱动链（场景光照钩子 vs 车型内饰灯光钩子） | 唯一驱动链 = 时间语义通道 `interiorPower/interiorEmphasis` → `InteriorLightHooks.applyInteriorLight()`；场景仅得 `interiorGlow` 车外衬光 |
| D3 | 布料/粒子/灯点归属（场景动效 vs 公共系统） | 七-5 点名布料（天幕/吊床/挂毯/晾晒衣物/小旗）与车辆布料件全部注册 WindSystem；粒子归 ParticleSystem；灯效归 LightBreathSystem；场景只保留私有编排（波光、海鸟、松鼠、探照灯云台） |
| D4 | 皮卡+拖挂注册粒度 | 注册为**单一车型模块** `trailerRig`（固定相对摆位、组合整体居中对位、拖挂承载内饰灯） |
| D5 | 过渡时长定值（四-5「1~2 秒」区间、天气/场景「平滑/短暂」未量化） | 时间 1500ms、天气 1500ms、场景/车型 600ms；离散装饰状态 blend≥0.5 中点切换 + 0.2s 短淡入；常量集中 `core/transition.ts` |
| D6 | 松林固有云雾 × 天气浓雾叠加 | 雾/云**单通道合成**：`fog=(scene.baseFog+time.fogBase)×weather.fogMul`，AtmosphereSystem 唯一出口，杜绝双重叠加 |
| D7 | UI 图标来源与框架 | 内联 SVG 程序化绘制（`ui/icons.ts`），UI 原生 DOM+CSS 零框架零图标包 |
| D8 ★ | 四-2「灯具全部熄灭」× 四-1「刚开灯的便利店」× 七-4「售货机灯带常亮」表面冲突（原文内部张力） | 「灯具」限定为**营地/装饰灯具**（`lampPower` 通道，白天=0）；商业照明（便利店灯箱/售货机灯带/加油棚灯/城市窗灯）走独立 `shopPower` 通道（清晨 0.35 刚开灯→白天 1.0 营业亮→黄昏 0.65 初亮→夜间 1.0 主角）；售货机灯带取 `max(shopPower, 0.7)` 常亮 |
| J1 | `BaseStyleSpec` 字段 | topTheme/edgeMatId/rimDecal/skirtLayers/silhouette（场景章提案，架构采纳） |
| J2 | 松林「木质营位平台」与营位关系 | 车辆停碎石地，平台在侧后作生活区（4.6×3.8 容不下任意车型），「木质营位平台」字面仍完整实现 |
| J3 | 售货机「货道排列可见」粒度 | 货道=**真实小几何**（3×4=12 商品盒实例化），非贴图模拟 |
| J4 ★ | 早餐餐具落点（场景章「仅海崖」vs 时间天气章「四场景就餐面」） | 按原文四-总则「每个场景装饰物状态都要变化」采用**四场景就餐面**方案（海崖折叠桌主展示：盘×2+杯×2+壶；松林原木凳面；避难所板条箱面；服务区长椅），仅清晨出现 |
| J5 ★ | 避难所探照灯时序（四-1「换岗」×四-2「熄灯」×四-3「启动」） | 清晨亮（换岗快扫）→ **白天熄**（灯具全熄）→ 黄昏启动 → 夜间全亮慢扫 |
| J6 | 路牌/警示牌/招牌文字内容（原文未给） | 海崖「潮見岬／Sea Cliff Camp →」；松林「滝の道 0.8km／山小屋 2.5km／キャンプ場」；避难所「立入禁止／危ない！」（手写、**无骷髅图形**）；服务区「出口 12 ↑ E-1／出口 E-28 まもなく／STATION HAYABUSA・道の駅 はやぶさ」 |
| J7 | 城市剪影内容 | 8–10 栋低楼群、2:1 高低差、无尖塔、夜间窗灯 shopPower×0.6 抽样点亮（20%/35%） |
| J8 | 水电桩管线与车型解耦 | 管线终止于营位边缘地环，不接触车型——任何车辆可停 |
| B1 | 早餐餐具 | 见 J4（四场景就餐面） |
| B2 | 探照灯扫动时序 | dawn 快扫 6s/55° → day 熄 → dusk 10s/45° → night 慢扫 14s/40° |
| B3 | 车流密度定值 | dawn 0.35 / day 0.55 / dusk 0.8（渐密）/ night 1.0；天气修正 rain×0.85、fog×0.9、snow×0.8；白天光流弱可见 0.3 |
| B4 | 动效/粒子/积雪数值定档 | **第七章为唯一参数源**：第四章行内数值与括号值均是对第七章的引用，两处不一致时以第七章为准（本合并已逐项回改对齐，含车型章括号值补字段名前缀）；实机复盘可整体微调 |
| B5 | 售货机灯带常亮 | 下限 0.7（`max(shopPower, 0.7)`） |
| B6 | 发电机蒸汽 | 常转 base 1.5/s + smokePower 白天增密（7.3-④ 常驻与四-2 自洽） |
| B7 | 降雪与水面 | 水面**不封冻**（海面/溪流波光 ×0.85、水色向青灰 10%），积雪仅作用原文枚举部位 |
| B8 | 火焰功率 | 统一走 `emberPower`：dusk/night=1.0、dawn=0.5 余烬、day=0 熄火+炊烟 |
| B9 | 雾映射 | D6 公式 + `FogExp2.density = 0.015 + fog01^1.6×0.075` + clamp 1.0；剪影板逐层乘法衰减 |
| B10 | 云影实现 | 共享 512² fbm 贴图、ground shader 采样、uv 沿风向滚动 0.008/s |
| B11 | 光斑/星空/月氛围参数 | 见 4.3.4/第七章定值表 |
| U1 | 控件形态与布局 | 六.1 二选一取**分段按钮**；桌面底部居中四行玻璃面板（约 420×262px），窄屏 <720px 折叠为「页签条+单组展开」 |
| U2 | 场景/车型淡入淡出机制 | FadeSwap：切换时一次性克隆组内材质驱动 opacity（防共享材质污染），出/入各 300ms，附 4% 缩落「换展品」微动 |
| U3 | 玻璃基调 | 深色磨砂玻璃基线 + 强调色随时间档四值联动（dawn 青/day 白/dusk 琥珀/night 月白） |
| U4 | 相机控制 | **自研轨道相机**（约 150 行 Pointer Events，球坐标+指数阻尼+双指纯缩放），不引 OrbitControls |
| U5 | 状态持久化 | **不持久化**任何 UI/组合状态（无 localStorage），刷新必回默认组合（十一.1） |
| U6 | 连点语义 | 时间/天气过渡 retarget（从当前中间值续变）；场景/车型队列深度 1 后到覆盖；重复点击 no-op |
| Q1 | 「鸟鸣般的光斑跳动」是否真实音频 | **纯视觉**（全文无音频系统），songBurst 节奏模拟 |
| Q2 | 末世蒙尘涂装默认取向 | `PaintSpec.weathering` 预留、**默认关闭**（任何组合保持干净观感） |
| Q3 | 降雪对水面影响 | 见 B7 |
| Q5 | 3.5「手持对讲机」 | 按「手持式对讲机**道具**（摆放后座）」理解，无任何人物几何（一·6） |
| Q6 | 60fps 验收口径 | **1080p、集成显卡级设备、稳定 ≥55fps（1% low ≥40）视为达成 60fps 目标**；实测矩阵见 5.7.5/T44 |
| ★-尺度 | 渲染章草稿「底座 10×10、车长 1.9–2.4 单位」与场景章「20×20u」、车型章「C 型长 6.4」矛盾 | 统一：**底座 20×20u、1 单位≈1m 观感**；13 章 §5.1/§2.7/§3.4 与 UI 章 §7.1 的连带标定按 20×20 修正（实现期校准） |
| ★-半径 | 车型章按 `camp.radius≥5.5` 设计 vs 场景章 4.0–4.2 | 以场景章为准（底座 20u 是 D1 硬约束），车型尺寸回调（拖挂组合目标外接半径 ≤4.2；**A型同口径回调：9.0×2.7 外接半径 ≈4.70 → 7.9×2.7 ≈4.18**——4.70 大于全部营位半径 4.0–4.2，20 种落位将恒触告警）；二者在 4.0 半径营位仍会告警，属既定非阻断行为（见 R15）；越界仅告警不阻断 |
| ★-label | 车型章 label「皮卡+拖挂」vs UI 章短名与原文六.2 示例「拖挂房车」 | 统一 label 短名：场景=海崖/山间松林/末日避难所/服务区；车型=C型房车/A型大巴/拖挂房车/B型面包车/越野皮卡 |
| ★-B型升顶 | 原文 3.4-6 内部透视途径含「掀顶帐帘」而 3.4-1…5 外部清单未列升顶（原文内外清单不一致） | 以 3.4-6 为准**补建升顶**（楔+帐帘带+收拢卷），属解释性补建，请用户确认 |
| ★-C型布料 | 时间天气章布料总表误列「C 型遮阳棚」（C 型无遮阳棚） | 删除该行；C 型布料=升顶帐帘带（车内微风 windFactor 0.12、stiffness 0.9） |
| ★-挂毯 | 车型章未将 B 型挂毯注册为布料，原文七-5 枚举含「挂毯」 | 按原文补注册 `ClothHandle`（车内微风 windFactor 0.12） |
| ★-灯点参数 | 场景章部分灯点周期（2.4s/3.2s/5s 等）不在七-5「统一节奏」族（T_base=3s 的 1.5/3/6s） | 统一采用动效章灯点注册总表（第七章 7.1.4）：串灯 blink 3s/depth0.3/stagger、营地灯 breath 1.5s→steady、招牌微闪 breath 6s+偶发双闪、警示红灯 rotate 0.4rev/s、天线灯 blink 1.2s 等；**灯塔光束转速取 0.25rad/s（≈25s/圈，更贴七-1-④「缓慢旋转」）** |
| ★-帆船 | 时间天气章与场景章的帆船四档位置坐标表不一致 | 以场景章为准（sailboat 归海崖场景模块），见 4.1.1 光照钩子表 |
| ★-通道口径 | 场景章行为表按场景给出与全局不同的通道值 | 六语义通道为**全局定值**（4.3.2 表）；场景行为表 = 场景对通道的**解释结果**（灯点/装饰物状态） |
| ★-城市微光 | 避难所城市剪影微光驱动通道不一（lampPower×0.3 vs shopPower×0.6） | 依 D8 统一为 shopPower×0.6 窗灯抽样 |
| ★-baseFog | 三份草稿雾基底数值不一 | baseFog 属 `ScenePalette`（场景数据）：海崖 0.10 / 松林 0.32 / 避难所 0.14 / 服务区 0.08；综合光照速查矩阵为示意值 |
| ★-偶发参数 | 海鸟/松鼠/火星/车流等参数两章不一致 | 偶发与节奏参数归 EventScheduler/RhythmClock（动效章定值，架构 Q4 委托）：海鸟 16s±6s·1~3 只·3.2Hz·夜间归巢、松鼠 26s±10s、纸巾阵风 11s±4s、光斑鸟鸣 9s±3s、招牌双闪 20s±8s、火星 6×emberPower/s、车流密度 B3 表 |
| ★-晨雾机制 | 场景章用雾板 billboard、时间天气章用 mist 粒子 | 合并为同一雾源（D6 fog01 调制）下的三层表现：全局 FogExp2 + 雾板 billboard + mist 粒子 |
| ★-波光 | 海面波光滚动速度两章数值不一 | 以场景章 SceneAnimation 实现值为准（0.030,0.012)/(−0.020,0.008) u/s，动效章数值作调参起点 |

---

## 二、技术选型与理由

> 依据原文八.1（pnpm + Vite + Three.js + TypeScript「建议/优先」措辞 + 纯浏览器运行时不联网）、八.2（禁 DCC、全程序化）、八.3（60fps）、九.1/九.2/九.4/九.5。**硬性流程声明：本文所列全部依赖处于「计划引入·未安装」状态；DESIGN.md 经用户审阅同意之前不执行任何 `pnpm install`、不创建 `package.json` 等脚手架文件**（九.1）。

### 2.1 选型总览

| 层 | 选型 | 原文依据 | 状态 |
|---|---|---|---|
| 包管理器 | **pnpm** | 八.1「使用 pnpm 作为包管理器」 | 硬性（原文明示） |
| 构建工具 | **Vite** | 八.1「技术栈建议 Vite」 | 建议→采纳，待用户确认 |
| 渲染引擎 | **Three.js**（runtime 唯一依赖） | 八.1「建议 Three.js」 | 建议→采纳，待用户确认 |
| 语言 | **TypeScript（strict）** | 八.1「TypeScript 优先」 | 优先→采纳，待用户确认 |
| UI | 原生 DOM + CSS，零框架 | 八.2 程序化精神、D7 | 已拍板，待确认 |
| 图标 | 内联 SVG 程序化生成（`ui/icons.ts`） | D7 | 已拍板，待确认 |
| 相机控制 | 自研轨道相机（~150 行），不引 OrbitControls | U4 | 已拍板，待确认 |
| 建模/贴图 | 全部代码程序化，零 DCC、零外部资源文件 | 八.2 | 硬性（原文红线） |

一句话：**runtime 依赖只有 `three`；构建期依赖只有 vite + typescript（+ 类型声明）；其余一切（UI、图标、相机、贴图、几何、雾、粒子、描边）全部自研**。

### 2.2 渲染引擎：Three.js

选择理由：①八.2 点名的三渲二路径（`MeshToonMaterial`+gradientMap 色阶、反壳描边、Box/Cylinder/Lathe/Extrude/Tube/InstancedMesh 程序化几何）全部内建；②Lathe/Extrude/实例化是原文点名手段，一等功能；③`onBeforeCompile` 支撑 RGB ramp/高光带/rim 补丁与布料、天气共享 uniform 注入；④`BufferGeometryUtils`、可选 `EffectComposer/UnrealBloomPass` 均随 three 包分发，不构成新依赖；⑤生态与类型最成熟。

| 备选 | 结论 | 理由 |
|---|---|---|
| Babylon.js | 不选 | 引擎更重；toon/反壳同样要自搭；各分章方案已按 three API 编写 |
| PlayCanvas | 不选 | 云工作流与「纯本地、零 DCC」约束不合 |
| regl/裸 WebGL2 | 不选 | 阴影/雾/实例化/纹理管线全要从零造 |
| R3F 声明式封装 | 不选 | 引入 React 全家桶，违背 runtime 仅 three |
| PixiJS | 不选 | 2D 引擎，维度不符 |

**版本策略**：锁定 ≥0.160 近期稳定版（具体版本号以安装时 `pnpm view three version` 实查为准），精确版本写入 package.json + `pnpm-lock.yaml` 提交本地 git，记入 DEPENDENCIES.md。原因：onBeforeCompile 补丁与 three 内部着色器字符串耦合（风险 R1），版本一经锁定不得随手升级，升级须重跑补丁冒烟用例（T06）。

### 2.3 构建工具：Vite

理由：①零配置满足 TS 编译/dev server（内置浏览器调试走 localhost 回环，符合九.2）/静态产物输出/`import.meta.env.DEV`；②dev 冷启动与 HMR 快（源文件量大，迭代保障）；③产物为纯静态 `dist/`，无运行时框架引导。备选 webpack（配置量大、无增益）、esbuild 直用（缺 dev 服务与产物管理）、Rolldown/Rspack（插件兼容面窄）、无构建原生 ESM（examples/jsm 路径重写与压缩不达标）均不选。

配置要点（进 T01）：`base:'./'`；`build.target:'es2020'`；`resolve.alias` 按目录树配置配合依赖纪律 review；dev server 仅监听 localhost。

### 2.4 语言：TypeScript strict

理由：①四套注册表接口用类型强制（`SceneModule` 五部分、`VehicleModule` 四项漏实现即编译不过）——2.5/3.6「新增不改核心」的编译期保障；②四类句柄是内容层与公共系统唯一交汇面，字段由类型约束（含 M1–M4 增补字段 `windFactor/sagAmp/dripAnchors/pattern/floor/snowShell/castReflection`）；③400 组合零分支靠语义通道与 uniform 命名对齐，`as const`+类型收窄；④strict + `noUncheckedIndexedAccess` 抓住查表访问空值风险。备选纯 JS（无接口强制）、JSDoc（表达受限）不选。

### 2.5 pnpm 工作流（本机基线实测：2026-11-08 只读命令复核）

| 项 | 值 | 命令 |
|---|---|---|
| node | v24.19.0 | `node --version` |
| pnpm | 12.3.4 | `pnpm --version` |

- `engines` 约束 `node >= 20.19`；包版本一律精确锁定（`--save-exact` + lockfile 提交本地 git）。
- scripts 约定：`pnpm dev`（内置浏览器打开 dev server，九.2）/ `pnpm build`（`tsc --noEmit && vite build`）/ `pnpm preview` / `pnpm typecheck`。
- 单包项目不用 workspace；不引入 linter/formatter（依赖最少化延伸）。
- pnpm ≥10 拦截依赖 postinstall：esbuild 可能需 `pnpm approve-builds`（或预置 `pnpm.onlyBuiltDependencies`），**过程与结果记入 DEPENDENCIES.md**。
- 删除/重装红线（九.4）：node_modules 异常只允许 `pnpm install --force` 自修复或整体重命名 `node_modules_broken` 挪开；严禁通配符/递归删除。
- 首次安装新依赖版本必然联网（构建期一次性动作，先过 DEPENDENCIES.md 审批闸门）；入 store 后同版本可 `--offline`。

### 2.6 纯浏览器、运行时不联网的保障（八.1 红线）

| # | 层面 | 保障手段 |
|---|---|---|
| 1 | npm 依赖 | runtime 仅 `three`，构建期打进 bundle；运行时零包管理器解析 |
| 2 | 网络 import | 禁止 CDN import；构建后 `grep -rE "https?://" dist/`（排除注释）校验无外链 |
| 3 | 字体 | UI 系统字体栈，零 web font |
| 4 | 图标 | 内联 SVG 程序化生成，零图标包零图片请求 |
| 5 | 贴图 | 全部 Canvas/SVG 程序化；SVG 光栅化用 data URI→Image（同文档资源）；`tex/preloadAll()` 场景装配前 await |
| 6 | favicon | index.html 内联 SVG data URI |
| 7 | 运行时 fetch | 接口层无异步加载路径，SharedAssets 全同步缓存 |
| 8 | 验收 | 交付前断网运行验证一次，记入 TASKS.md（T47） |

开发期 dev server 为本机回环，不属「运行时联网」。

### 2.7 构建产物形态与启动方式

```
dist/
├── index.html            # 唯一入口（内联 favicon data URI）
├── assets/index-<hash>.js   # TS 源码 + three 打包产物（tree-shaken、minify）
└── assets/index-<hash>.css  # UI 样式
（无图片/字体/模型文件——全部资源运行时程序化生成）
```

- 预估 JS 主包 gzip 约 0.4~0.6 MB（设计预估值，T01 实装后以 `vite build` 输出实测回填 DEPENDENCIES.md）。
- 启动：开发调试 `pnpm dev`（内置浏览器）；构建验证 `pnpm build`→`pnpm preview`；最终交付 `dist/` 交任意本地静态服务器。**双击 `file://` 直开默认不支持**（ES module CORS）；如需可引入备选依赖 `vite-plugin-singlefile`，**由用户审阅时拍板**。

### 2.8 明确不引入的依赖（负面清单）

前端框架（React/Vue/Svelte）、UI 组件库、图标包、three/examples OrbitControls、着色/后处理独立包（bloom 用 three 包内 examples/jsm）、物理/布料引擎（布料走 WindSystem 顶点 shader）、噪声/数学库（gust 与 fbm 自写 ~60 行）、**建模 DCC（Blender 等，八.2 硬性禁止）**、音频（全文无音频需求，Q1 纯视觉）。

### 2.9 依赖汇总（明细与体积归 DEPENDENCIES.md 跟踪）

| 包 | 角色 | 版本策略 | 状态 |
|---|---|---|---|
| `three` | runtime（唯一） | ≥0.160 近期稳定，安装时实查锁定 | 计划引入·未安装 |
| `vite` | devDependency | 安装时最新稳定 | 计划引入·未安装 |
| `typescript` | devDependency | 最新稳定 5.x | 计划引入·未安装 |
| `@types/three` | devDependency（若 three 未自带类型） | 与 three 对齐 | 计划引入·未安装（视实装可取消） |
| `vite-plugin-singlefile` | devDependency（**备选**，仅当用户要求 file:// 直开） | 最新稳定 | 备选·未决定·未安装 |

### 2.10 与工作流程的衔接

审阅通过前不 install/不建 package.json/不写源码（九.1；文档阶段仅可创建目录与 Markdown）。**更正（2026-11-08 实测）**：本地 `git init` 不属九.1 门禁——原文九.5-b 明确允许项目目录内初始化本地 git；本地仓库实际已于文档阶段 2026-11-08 初始化，仅初始化（零提交：`git log --oneline --all` 为空；零远程：`git remote -v` 为空；全部文件未跟踪：`git status --short`），本节早前「批准前不 git init」的表述与实际不符，已更正并登记追认项（TASKS §6-7；不追认则按九.4 红线列待清理项交用户处理，不递归删除 .git）。审阅通过后 T01 一次性完成依赖安装+版本实查+DEPENDENCIES.md 状态翻转+本地 git 首笔提交（九.5-b）；后续任何依赖增删先改 DEPENDENCIES.md 再动 package.json（十.3）；选型若不成立按十.1 回写本文档。

---

## 三、整体架构设计

> 依据原文 2.5（L42–44）、3.6（L75–77）、八.4（L123 四套注册表与公共系统划分）、六节 UI、四节时间、五节天气、七节动效。本章接口名与代码块为架构章定稿，**全篇以此为准**。

### 3.1 架构总览

一句话：**内容模块只声明「是什么」，核心编排决定「怎么装配」，公共系统决定「怎么动」，渲染层决定「怎么画」；四套注册表把内容喂给组装点，除此之外内容与核心互不认识。**

分层（自上而下，依赖只允许向下，严禁反向 import）：

```
┌───────────────────────────────────────────────────────────────┐
│ content/  内容层：4 场景 · 5 车型 · 4 时间预设 · 5 天气预设        │  ← 新增内容只动这里
│           （scenes/ vehicles/ times/ weathers/，各自带 registry）│
├───────────────────────────────────────────────────────────────┤
│ ui/       控制界面：分段按钮、组合标题、隐藏/呼出（六.1–六.5）      │
├───────────────────────────────────────────────────────────────┤
│ core/     核心编排：Engine、Registry、State、Director、          │  ← 新增内容不改这里
│           TransitionController、BaseAssembler（统一底座）        │
├───────────────────────────────────────────────────────────────┤
│ systems/  公共可复用系统（八.4 L123）：风力 / 粒子 / 灯光呼吸 /    │
│           时间光照预设 / 天气材质状态 / 雾通道 / 偶发调度 / 时钟    │
├───────────────────────────────────────────────────────────────┤
│ render/   三渲二渲染层：卡通材质 + 色阶 ramp + 描边 + 天空 + 光照rig│
├───────────────────────────────────────────────────────────────┤
│ geom/ tex/ 程序化几何工厂与 Canvas/SVG 贴图工厂（八.2 红线落点）    │
└───────────────────────────────────────────────────────────────┘
```

四条依赖纪律（架构上保证 2.5「新增场景/车型不改核心渲染与切换代码」、3.6「新增车型不修改核心逻辑」）：

1. **单向依赖**：`content → core/systems/geom/tex/render`，反之严禁；`core/`、`render/`、`systems/`、`ui/` 中不存在任何对 `content/` 的 import。
2. **组装点唯一**：只有 `src/main.ts` 同时 import 四套注册表与 core，把注册表交给 Director。
3. **句柄交汇**：内容模块与公共系统之间只通过四类轻量句柄交互（`ClothHandle` / `LampHandle` / `EmitterSpec` / `WeatherSurface`），不存在内容直接调用系统内部实现。
4. **注册即识别**：UI 分组按钮、组合标题、切换逻辑全部从 `registry.list()` 驱动，注册表新增一行即出现在 UI（2.5「登记即可被UI与切换逻辑识别」）。

### 3.2 项目目录结构

```
mini-camp-diorama/
├── DESIGN.md                    # 实现基线文档（九.1 / 十.1）——审阅稿实际位于项目根（本树已按 2026-11-08 实际状态更正）
├── TASKS.md                     # 任务清单：四档状态 + 阶段复盘结论（十.2）——已随审阅稿建立，批准后转为基线
├── DEPENDENCIES.md              # 依赖统计：名称/版本/用途/体积（十.3）——已随审阅稿建立，批准后转为基线
├── docs/
│   └── drafts/                  # 分章草稿区（01~04、10~18；合并入 DESIGN.md 后保留作过程稿，十.0）
├── index.html                   # 唯一 HTML 入口；favicon 用内联 SVG data URI（零网络请求）
├── package.json                 # pnpm；runtime 依赖仅 three，dev 依赖仅 vite/typescript 系
├── tsconfig.json
├── vite.config.ts
├── .gitignore                   # node_modules/ dist/（九.4 红线：不递归删除，见九.4-b）
└── src/
    ├── main.ts                  # ★ 组装点：import 四套注册表 → new Engine → Director.applyState(默认组合)
    ├── core/                    # 核心编排（不含任何具体内容）
    │   ├── engine.ts            #   renderer/scene/camera/渲染循环/resize（八.5）
    │   ├── controls.ts          #   轨道相机：拖拽旋转、滚轮/双指缩放，鼠标+触屏（一.1/八.5）
    │   ├── registry.ts          #   泛型 Registry<T>：register/get/list
    │   ├── state.ts             #   AppState：scene/vehicle/time/weather 四维当前值 + 变更事件
    │   ├── director.ts          #   ★ Director：模块装配/卸载、四维切换编排、句柄注册与反注册
    │   ├── transition.ts        #   TransitionController：交叉淡入淡出/滑动过渡（时长定值见 §3.5.3）
    │   ├── baseAssembler.ts     #   BaseAssembler：统一正方形底座生成（一.3：形式统一，仅材质/边缘按场景换）
    │   └── events.ts            #   轻量事件总线（state 变更分发）
    ├── render/                  # 三渲二渲染层
    │   ├── toonMaterial.ts      #   ToonMaterialFactory：卡通材质 + 渐变色阶 ramp（ramp 贴图 Canvas 程序化生成）
    │   ├── outline.ts           #   OutlineSystem：反壳描边为主（八.2「反壳描边或后期描边均可」），物体级开关
    │   ├── lighting.ts          #   全局灯光 rig：1 方向光（日/月共用）+ hemisphere + ≤2 点光
    │   ├── sky.ts               #   程序化渐变天空/背景板：晚霞渐变、星空、月面（全局背景，不计入底座元素）
    │   └── postfx.ts            #   可选后期（光晕增强），带性能降级开关
    ├── systems/                 # 公共可复用系统（八.4 六项 + 支撑件，职责详见 §3.4）
    │   ├── clock.ts             #   RhythmClock：全局节奏源（统一呼吸周期/粒子节奏，七-5「统一节奏」）
    │   ├── wind.ts              #   WindSystem：风力参数 + 布料统一驱动
    │   ├── particles.ts         #   ParticleSystem：雨/雪/蒸汽/火星/晨雾/微尘/落叶/滴水统一发射器
    │   ├── lightBreath.ts       #   LightBreathSystem：灯光呼吸/闪烁/旋转（统一节奏分频）
    │   ├── timeLight.ts         #   TimeLightSystem：时间光照预设应用器
    │   ├── weatherMaterial.ts   #   WeatherMaterialSystem：天气材质状态（湿润/积水/积雪/下凹/划线）
    │   ├── atmosphere.ts        #   AtmosphereSystem：雾/云单通道合成（防场景云雾×天气雾双重叠加）
    │   ├── scheduler.ts         #   EventScheduler：偶发动效随机排程（海鸟掠过/松鼠窜过）
    │   └── handles.ts           #   ClothHandle / LampHandle / EmitterSpec / WeatherSurface 公共句柄定义
    ├── content/                 # ★ 内容层（新增内容只动这里）
    │   ├── scenes/
    │   │   ├── types.ts         #   SceneModule 及配套接口（§3.3.2）
    │   │   ├── registry.ts      #   sceneRegistry：登记 4 场景
    │   │   ├── seacliff.ts      #   2.1 海崖（默认场景，15 组元素 + 7 动效）
    │   │   ├── pineforest.ts    #   2.2 松林（12 组元素 + 7 动效）
    │   │   ├── wasteland.ts     #   2.3 避难所（13 组元素 + 7 动效）
    │   │   └── servicearea.ts   #   2.4 服务区（12 组元素 + 5 动效）
    │   ├── vehicles/
    │   │   ├── types.ts         #   VehicleModule 及配套接口（§3.3.3）
    │   │   ├── registry.ts      #   vehicleRegistry：登记 5 车型
    │   │   ├── classC.ts        #   3.1 C型（默认车型）
    │   │   ├── classA.ts        #   3.2 A型大巴
    │   │   ├── trailerRig.ts    #   3.3 皮卡+拖挂（单一模块含双子模型，决策 D4）
    │   │   ├── classB.ts        #   3.4 B型面包车
    │   │   └── overlandTruck.ts #   3.5 越野皮卡+车顶帐篷
    │   ├── times/
    │   │   ├── types.ts         #   TimePreset 接口
    │   │   ├── registry.ts      #   timeRegistry：登记 dawn/day/dusk/night
    │   │   └── presets.ts       #   四档预设数据（全局光照 + 语义通道，§3.3.4）
    │   └── weathers/
    │       ├── types.ts         #   WeatherPreset 接口
    │       ├── registry.ts      #   weatherRegistry：登记 clear/cloudy/rain/fog/snow
    │       └── presets.ts       #   五档预设数据（光照修正/粒子/材质状态/风力系数，§3.3.5）
    ├── geom/                    # 程序化几何工厂（八.2 红线：全部代码生成，禁止任何模型文件）
    │   ├── primitives.ts        #   基础体封装、Lathe/Extrude 帮手
    │   ├── instanced.ts         #   InstancedGroup：重复元素实例化帮手（八.3）
    │   └── parts/               #   可复用部件库：tree/rock/fence/cloth/vehicleKit/sign/...
    │                            #   ★ 部件库铁律：禁止任何人形/人物几何（一.6）
    ├── tex/                     # Canvas/SVG 程序化贴图工厂（八.2 红线）
    │   ├── canvasTex.ts         #   基础设施：创建/缓存/引用计数
    │   └── ...                  #   路牌/招牌/贴纸/木纹/沥青划线/警示牌手写字 等按需文件
    ├── ui/
    │   ├── ControlPanel.ts      #   四组分段按钮 + 组合标题条（六.1/六.2）
    │   ├── icons.ts             #   内联 SVG 图标程序化生成（零第三方图标依赖，决策 D7）
    │   ├── uiStyle.css          #   磨砂玻璃质感/圆角/细描边/微动效（六.3）；字体用系统字体栈（不联网）
    │   └── hiddenMode.ts        #   隐藏/呼出 UI（六.4 → 一.4）
    └── shared/
        ├── math.ts              #   常用数学小工具
        └── rng.ts               #   可复现随机（以内容 id 为种子，保证同组合视觉稳定）
```

**运行时不联网的落实**：runtime 依赖只有 `three`（构建期打包进产物）；无 CDN、无 web font、无运行时 fetch；所有贴图 Canvas/SVG 现场生成（八.2）。Vite 仅用于开发与构建，产物为纯静态文件。

### 3.3 四套互相独立的注册表接口

四套注册表**互相独立**（八.4）：各自拥有独立 entry 类型与 registry 实例，彼此不 import；跨维度效应（时间影响场景、天气影响风力）一律经 Director 与语义通道中转，注册表之间零直连。400 种组合（十一）= 四个维度的正交组合，不产生 N×M 的分支代码。

#### 3.3.1 注册表基础设施（core/registry.ts）

```ts
export interface RegistryEntry {
  readonly id: string;          // 稳定标识：'seacliff' / 'classC' / 'dusk' / 'rain'
  readonly label: string;       // UI 展示名（六.2 组合标题「场景 · 车型 · 时间 · 天气」）
  readonly isDefault?: boolean; // 默认档：海崖/C型/黄昏/晴朗（原文 L3、L151）
}

export class Registry<T extends RegistryEntry> {
  register(entry: T): void;     // 重复 id 立即抛错（尽早暴露）
  get(id: string): T;           // 未登记抛错并列出可用 id
  list(): readonly T[];         // 保持注册顺序，UI 分段按钮按此渲染（六.1）
}
```

#### 3.3.2 场景注册表 —— SceneModule（照 2.5 五部分逐字段落实）

```ts
// content/scenes/types.ts
export interface SceneModule extends RegistryEntry {
  /** ① 地形：底座之上的大地形（崖体/溪流/碎石地/公路/划线车位…）+ 中央营位锚点 */
  buildTerrain(ctx: SceneBuildContext): SceneTerrain;

  /** ② 道具布置：2.1–2.4 元素清单逐组建到这里，并交出四类句柄 */
  buildProps(ctx: SceneBuildContext): SceneProps;

  /** ③ 场景动效：7.1–7.4 逐项落在这里（布料/粒子/灯点只交句柄与配置，见决策 D3） */
  createAnimations(runtime: SceneRuntime): readonly SceneAnimation[];

  /** ④ 色彩基调：场景固有色彩通道（再被时间/天气调制）+ 底座样式 + 固有雾基底 */
  readonly palette: ScenePalette;

  /** ⑤ 光照钩子：把语义光照通道翻译成本场景灯点与装饰物状态的唯一入口 */
  readonly lightHooks: SceneLightHooks;
}

export interface SceneBuildContext {
  readonly root: THREE.Group;      // 本场景挂载点（core 创建，统一底座已由 BaseAssembler 就位）
  readonly assets: SharedAssets;   // 程序化几何/贴图缓存与部件库（引用计数，§3.7）
  readonly rng: Rng;               // 以场景 id 为种子（同组合视觉可复现）
}

export interface SceneTerrain {
  readonly group: THREE.Group;
  /** 中央营位锚点：任何车型停任何场景的唯一落位依据（三·总则） */
  readonly campAnchor: {
    readonly position: THREE.Vector3;  // 底座视觉中心（2.1–2.4 均要求车辆居中）
    readonly headingRad: number;       // 默认朝向（车型可轻微适配，三·总则）
    readonly groundY: number;          // 营位地面高度（车型接地高度适配）
    readonly radius: number;           // 营位可用半径（footprint 越界即告警）
  };
}

export interface SceneProps {
  readonly group: THREE.Group;
  /** 具名道具：装饰物状态切换的取用点（野餐垫/桌椅/帆船/送货小车/早餐餐具…） */
  readonly named: Readonly<Record<string, THREE.Object3D>>;
  /** 布料句柄 → WindSystem 统一驱动（天幕/晾晒毛巾/小旗…，七-5） */
  readonly cloths: readonly ClothHandle[];
  /** 灯点句柄 → LightBreathSystem + 时间编排（串灯/营地灯/灯塔/灯箱/售货机灯带/探照灯/警示红灯） */
  readonly lamps: readonly LampHandle[];
  /** 粒子发射器配置 → ParticleSystem（蒸汽/火星/晨雾/微尘/落叶/屋檐滴水） */
  readonly emitters: readonly EmitterSpec[];
  /** 天气材质挂点 → WeatherMaterialSystem（地面湿润/积雪/顶面积雪/布料下凹的作用面） */
  readonly weatherSurfaces: readonly WeatherSurface[];
}

export interface SceneAnimation {
  update(dt: number, elapsed: number): void;  // 偶发型动效内部用 EventScheduler，不自行 setTimeout
  dispose(): void;
}

export interface ScenePalette {
  /** 场景固有具名色彩通道（如 sea/foliage/concrete/asphalt）：时间与天气只调制通道，不触碰具体材质 */
  readonly colorChannels: Readonly<Record<string, RGB>>;
  /** 底座样式：仅材质与边缘处理差异，形式由 BaseAssembler 统一（一.3） */
  readonly baseStyle: BaseStyleSpec;
  /** 场景固有雾/云基底（松林晨雾偏高）：与天气雾系数单通道合成（决策 D6） */
  readonly baseFog: number;   // 0..1
}

export interface SceneLightState {
  readonly time: TimeId;
  readonly weather: WeatherId;
  /** 语义灯效通道（时间预设给出 → 天气修正 → 过渡器插值后下发，0..1） */
  readonly lampPower: number;      // 营地/装饰灯具总功率（清晨≈0.15"将熄未熄"，白天=0，黄昏/夜间=1）
  readonly emberPower: number;     // 篝火余烬（清晨 0.5 → 白天 0）
  readonly smokePower: number;     // 炊烟/蒸汽等"白天活动"细节（四-2）
  readonly shopPower: number;      // 商业照明通道：灯箱/售货机灯带（决策 D8，四-1"刚开灯"与四-2"灯具全熄"分流）
  readonly interiorGlow: number;   // 车内暖光对车外环境的衬光（不驱动车内灯本体，见决策 D2）
  readonly fogDensity: number;     // 合成雾密度（AtmosphereSystem 已合成）
  readonly global: GlobalLightParams; // 日/月方向与色、环境光、天空渐变参数、阴影参数
}

export interface SceneLightHooks {
  /** 唯一入口：灯点开关/明暗、装饰物状态（帆船位置/早餐餐具/探照灯扫动）随时间与天气变化；blend∈[0,1] */
  applyLighting(state: SceneLightState, blend: number): void;
  /** 可选：句柄表达不了的每帧细粒度驱动（如帆船"刚刚出海"的位移插值） */
  update?(dt: number, elapsed: number): void;
}

export interface SceneRuntime extends SceneBuildContext {
  readonly wind: WindSystem;
  readonly particles: ParticleSystem;
  readonly breath: LightBreathSystem;
  readonly scheduler: EventScheduler;
  readonly camera: THREE.PerspectiveCamera; // 仅云带等 billboard 需要
}

// content/scenes/registry.ts
export const sceneRegistry = new Registry<SceneModule>();
sceneRegistry.register(seacliff);    // isDefault: true（默认组合）
sceneRegistry.register(pineforest);
sceneRegistry.register(wasteland);
sceneRegistry.register(servicearea);
```

> 架构注记：**统一底座不归场景模块建模**。BaseAssembler 按 `palette.baseStyle` 生成正方形底座（形式全场景统一），场景模块的 `buildTerrain` 只造底座之上的分层地形。远景（帆船与灯塔/山脊云带/高架桥与城市剪影）全部收在底座范围内，用分层底座（下沉层/后缘剪影板）表达，见决策 D1。

#### 3.3.3 车型注册表 —— VehicleModule（照 3.6 四项逐字段落实）

```ts
// content/vehicles/types.ts
export interface VehicleModule extends RegistryEntry {
  /** ① 外部模型：车身外观程序化建模 + 涂装通道 + 可透视窗 + 车辆布料件 */
  buildExterior(ctx: VehicleBuildContext): VehicleExterior;

  /** ② 展开机构：外拓展机构拆成可动部件，默认"已展开"交付（三·总则两个核心特征之一） */
  buildDeployment(ctx: VehicleBuildContext): readonly DeploymentPart[];

  /** ③ 透视内饰：透过车窗/帐帘清楚看到的内部陈设（3.1–3.5 内部清单逐项落点） */
  buildInterior(ctx: VehicleBuildContext): VehicleInterior;

  /** ④ 内饰灯光钩子：车内灯点集合 + 全局编排的唯一下发入口 */
  readonly interiorLightHooks: InteriorLightHooks;
}

export interface VehicleBuildContext {
  readonly root: THREE.Group;        // 本车型挂载点（core 已按当前场景 campAnchor 对位）
  readonly camp: CampAnchorSnapshot; // 接地高度/朝向/半径 → "轻微适配"（三·总则，不强制）
  readonly assets: SharedAssets;
  readonly rng: Rng;
}

export interface VehicleExterior {
  readonly group: THREE.Group;
  readonly footprint: Footprint;                 // 接地长宽/轮距/车高（营位对位与越界检查）
  readonly paint: PaintSpec;                     // 基础涂装 + 可选 weathering（末世蒙尘，默认关闭，见遗留 Q2）
  readonly windows: readonly WindowSpec[];       // 可透视窗（内饰可见性随窗控制；玻璃卡通材质）
  readonly cloths: readonly ClothHandle[];       // 车辆布料件（遮阳棚/纱帘/帐帘/遮阳幕）→ WindSystem + 雨天积水下凹
}

export interface DeploymentPart {
  readonly node: THREE.Object3D;
  readonly kind: 'popTop' | 'slideOut' | 'awning' | 'step' | 'jackLeg'
               | 'roofTent' | 'tailgate' | 'other';   // 升顶/滑舱/遮阳棚/踏步/支撑腿/车顶帐篷/掀门…
  readonly deployAmount: number;   // 1 = 已展开（默认交付状态；保留数值便于日后加展开动画）
}

export interface VehicleInterior {
  readonly group: THREE.Group;     // 与 exterior 分组，便于按 windows 管理可见性
  readonly named: Readonly<Record<string, THREE.Object3D>>; // 3.1–3.5 内部清单逐项（如 nightLamp/sofa/shelf…）
}

export interface InteriorLightHooks {
  /** 车内灯点（小夜灯/暖色灯带/车内串灯/帐篷 LED 灯串）→ 统一交 LightBreathSystem（7.1"呼吸明暗"落点） */
  readonly lamps: readonly LampHandle[];
  /** 唯一驱动入口：全局灯光编排按时间档下发功率与强调值；车型模块不自行读取时间（决策 D2） */
  applyInteriorLight(power: number, emphasis: number, blend: number): void;
}

// content/vehicles/registry.ts
export const vehicleRegistry = new Registry<VehicleModule>();
vehicleRegistry.register(classC);        // isDefault: true
vehicleRegistry.register(classA);
vehicleRegistry.register(trailerRig);    // 决策 D4：皮卡+拖挂注册为单一模块
vehicleRegistry.register(classB);
vehicleRegistry.register(overlandTruck);
```

> 「细节量不得少于 C 型」（三·总则）在架构上的落实方式：`VehicleInterior.named` 与 3.1–3.5 逐条清单一一对应，TASKS.md 按清单勾验（九.3 复盘落点），不存在「少于」的通路。

#### 3.3.4 时间注册表 —— TimePreset（光照预设 + 装饰物语义通道，四-5）

```ts
// content/times/types.ts
export interface TimePreset extends RegistryEntry {
  /** 全局光照：日/月方向与色温、强度、环境光、天空渐变端点、阴影参数（长投影/短投影）、雾基准 */
  readonly lighting: GlobalLightParams;
  /** 语义通道：场景 lightHooks 与车型 interiorLightHooks 的统一下发值（0..1） */
  readonly channels: {
    readonly lampPower: number;        // 营地/装饰灯具（白天=0"灯具全部熄灭"→仅指此类，见决策 D8）
    readonly emberPower: number;       // 篝火余烬（清晨 0.5，其余档 0/1 按场景解释）
    readonly smokePower: number;       // 炊烟/蒸汽（白天=1）
    readonly shopPower: number;        // 商业照明（清晨刚开灯/白天营业亮/黄昏初亮/夜间主角）
    readonly interiorPower: number;    // 车内灯功率（黄昏点亮，夜间 1）
    readonly interiorEmphasis: number; // 车内暖光强调（夜间更高，四-4）
  };
  readonly transitionMs: number;       // 统一 1500（四-5"1~2 秒"区间取定值，决策 D5）
}

// content/times/registry.ts —— dawn / day / dusk(isDefault) / night
export const timeRegistry = new Registry<TimePreset>();
```

> 时间档是**数据而非逻辑**：四档预设只写参数，所有「怎么变」由 TimeLightSystem + 过渡器执行，场景通过 `lightHooks` 解释语义通道（如四-1 各场景专属表现：帆船位置、晨雾、送货小车、换岗探照灯，都由各场景 `applyLighting` 消费通道后自行表达）。这保证「新增时间档也只需新增预设数据」。

#### 3.3.5 天气注册表 —— WeatherPreset（光照修正 + 粒子 + 材质状态，五·总则）

```ts
// content/weathers/types.ts
export interface WeatherPreset extends RegistryEntry {
  /** 要素① 光照强度修正：乘到时间光照预设上（夜间浓雾 = 更暗 + glowBoost 更强光晕，五-6） */
  readonly lightMod: {
    readonly intensityMul: number;   // 主光强度系数
    readonly ambientMul: number;     // 环境光系数
    readonly glowBoost: number;      // 光晕增强（浓雾最高）
  };
  /** 要素② 粒子：雨丝/雪花/雾霭配置；空数组 = 晴朗基准（五-1） */
  readonly particles: readonly ParticleSpec[];
  /** 要素③ 材质状态：全部经过渡器插值后写入共享 uniform（WeatherMaterialSystem 消费） */
  readonly material: {
    readonly wetness: number;        // 地面湿润反光（夜间灯光拉出彩色反光，五-3）
    readonly puddle: number;         // 水洼涟漪强度
    readonly clothSag: number;       // 天幕/遮阳棚积水微微下凹（五-3）
    readonly snowCover: number;      // 屋顶/天幕/树枝/护栏/桌椅顶部/地面薄雪（五-5）
    readonly lineFade: number;       // 服务区车位划线若隐若现（五-5 特例，作用于地面划线贴图）
    readonly fogMul: number;         // 雾系数（与场景基底/时间基准单通道合成，决策 D6）
    readonly cloudShadow: number;    // 云影在地面缓慢移动（五-2）
  };
  readonly windMul: number;          // 风力系数（多云略增 → WindSystem，七.5）
  readonly transitionMs: number;     // 1500（五-6 与四-5 同标准，决策 D5）
}

// content/weathers/registry.ts —— clear(isDefault) / cloudy / rain / fog / snow
export const weatherRegistry = new Registry<WeatherPreset>();
```

#### 3.3.6 独立性核对表

| 注册表 | entry 接口 | 独立性保证 | 新增成本 |
|---|---|---|---|
| 场景 | `SceneModule`（五部分：terrain/props/animations/palette/lightHooks） | 不 import 车型/时间/天气注册表 | 新文件 + registry 一行 |
| 车型 | `VehicleModule`（四项：exterior/deployment/interior/interiorLightHooks） | 不 import 场景/时间/天气注册表 | 新文件 + registry 一行 |
| 时间 | `TimePreset`（纯数据） | 不 import 任何内容模块 | presets 追加一档 + 一行 |
| 天气 | `WeatherPreset`（纯数据） | 不 import 任何内容模块 | presets 追加一档 + 一行 |

### 3.4 公共可复用系统划分（八.4 六项 + 支撑件）

句柄模型先说明：内容模块与公共系统的**唯一交汇面**是 `systems/handles.ts` 的四个轻量类型——

- `ClothHandle { mesh, swayAxes, stiffness, windFactor?, sagAmp?, dripAnchors? }`：一块可摆动布料（M1 增补字段）；
- `LampHandle { emissiveMat?, halo?, mode: 'steady'|'breath'|'blink'|'rotate', params }`：一个灯点（M2：params 增 `pattern:'rev'|'sweep'` 与 `floor` 下限）；
- `EmitterSpec { kind: 'rain'|'snow'|'steam'|'spark'|'mist'|'dust'|'leaf'|'drip', area, rate, lifetime, size0, size1, vel0, color, opacity, additive }`：一路粒子（M3 字段明细化）；
- `WeatherSurface { material, kind: 'ground'|'roofTop'|'clothTop'|'linePaint', snowShell?, }`：一个受天气材质作用的面（M4 增 `snowShell`；灯点增 `castReflection` 注册位）。

| # | 系统 | 文件 | 职责（一条） | 被谁调用/注册 | 对应原文 |
|---|---|---|---|---|---|
| 1 | **RhythmClock** | `systems/clock.ts` | 全局节奏源：统一呼吸周期、闪烁相位、粒子节奏基准，供各系统分频取相位 | Director 每帧驱动；Wind/Breath/Particles 取值 | 七-5「统一节奏」 |
| 2 | **WindSystem** | `systems/wind.ts` | 维持全局风力参数（基准风速+阵风噪声），对所有注册布料统一施加摆动/轻晃/轻掀；写入布料 shader uniform；另暴露植被摆动 uniform 通道（P2） | 场景/车型经 `cloths` 注册；天气切换 `setWind(windMul×基准)` | 八.4「风力」、七-5、五-2「风力略增」 |
| 3 | **ParticleSystem** | `systems/particles.ts` | 统一 GPU 粒子发射器池：雨丝/雪花（天气）与蒸汽/火星/晨雾/微尘/落叶/滴水（场景）共用发射/回收/淡入淡出；每注册 EmitterSpec 返回实例句柄 `setRate()`（P1） | 天气预设 `particles`；场景 `emitters`；节奏取 RhythmClock | 八.4「粒子」、五-3/5-4/5-5、四-2「炊烟蒸汽」 |
| 4 | **LightBreathSystem** | `systems/lightBreath.ts` | 灯光呼吸/闪烁/旋转统一执行器（steady/breath/blink/rotate 四模式），叠加时间通道功率与天气 glowBoost 光晕 | 场景 `lamps`、车型 `lamps`；TimeLight 下发目标功率 | 八.4「灯光呼吸」、7.1「串灯闪烁/夜灯呼吸」、四-4「柔和光晕」 |
| 5 | **TimeLightSystem** | `systems/timeLight.ts` | 时间光照预设应用器：把 TimePreset 写入全局灯光 rig、天空渐变、雾通道，并生成 SceneLightState 下发场景/车型钩子 | Director 在时间切换/初始装配时调用 | 八.4「时间光照预设」、四-5 |
| 6 | **WeatherMaterialSystem** | `systems/weatherMaterial.ts` | 天气材质状态：wetness/puddle/clothSag/snowCover/lineFade/cloudShadow 写入共享 uniform（按引用注入），作用于 ground/roofTop/clothTop/linePaint 挂点 | Director 天气切换时调用；场景/车型经 `weatherSurfaces` 注册 | 八.4「天气材质状态」、五-2/5-3/5-5 |
| 7 | **OutlineSystem** | `render/outline.ts` | 描边（反壳为主，后期备选）：ToonMaterialFactory 建材质时自动配置描边壳，物体级开关 | 渲染管线每帧；geom/parts 按需标记 noOutline | 八.4「描边」、一.2、八.2 |
| 8 | **AtmosphereSystem** | `systems/atmosphere.ts` | 雾/云单通道合成：`fog = (scene.baseFog + time.fogBase) × weather.fogMul`，驱动云影移动、云带/剪影板逐层雾化——场景固有云雾与天气雾同源，杜绝双重叠加 | TimeLight/WeatherMaterial 写入分量；场景读结果 | 01 清单存疑 6、五-2/5-4 |
| 9 | **EventScheduler** | `systems/scheduler.ts` | 偶发动效随机排程：平均间隔/概率/最短间隔，触发回调（海鸟掠过、松鼠窜过、纸巾轻掀、光斑鸟鸣、招牌双闪） | 场景动效模块注册触发项 | 01 清单存疑 5、7.1/7.2「偶尔」 |
| 10 | **SharedAssets** | `core` 注入 + `geom/`、`tex/` 缓存 | 程序化几何/贴图缓存与部件库：同 id geometry/texture 引用计数共享 | 一切内容模块经 `ctx.assets` 取用 | 八.2「实例化复用」、八.3「控制 Draw Call」 |

**归属裁定**（回应 01 清单存疑 3，2.5 × 七-5 分工）：天幕轻摆（7-1-②）、吊床轻晃（7-2-⑤）、晾衣绳衣物飘动（7-3-⑥）、小旗飘动（7-4-④）**代码落点全部在 WindSystem**，场景模块只注册 `ClothHandle` 并给参数——七-5 明文「布料类元素统一受风力参数控制」，按公共系统实现才能保证全场景风力一致、随天气变化。场景动效模块保留：海面波光（shader 时间相位）、灯塔光束旋转（LampHandle rotate 模式）、海鸟/松鼠（EventScheduler + 专用小模型）、探照灯云台编排等**场景私有逻辑**。

### 3.5 渲染与数据流

#### 3.5.1 启动装配（一次性）

```
main.ts
  ├─ new Engine('#app')                      // renderer/camera/Controls/resize（八.5）
  ├─ import 四套 registry                    // ★ 全项目唯一 content←core 组装点
  └─ director.applyState({ scene:'seacliff', vehicle:'classC', time:'dusk', weather:'clear' })
       ├─ BaseAssembler.build(palette.baseStyle)          // 统一正方形底座（一.3）
       ├─ scene.buildTerrain() → buildProps()             // 地形 + 道具 + 四类句柄
       ├─ vehicle.buildExterior() → buildDeployment() → buildInterior()
       ├─ 把 cloths/lamps/emitters/weatherSurfaces 注册进 Wind/Particles/Breath/Material
       ├─ scene.createAnimations() → Director 持有
       └─ TimeLightSystem.apply(dusk, blend=1)            // 首帧直接呈现黄昏基准（不播过渡）
UI: ControlPanel 从四套 registry.list() 生成分段按钮（六.1）+ 组合标题（六.2）
```

#### 3.5.2 每帧循环（Engine.renderLoop，顺序固定）

```
① RhythmClock.update(now)            // elapsed、呼吸相位、粒子节奏
② TransitionController.update(dt)    // 产出插值中的光照/材质/语义通道值（若有进行中过渡）
③ 公共系统 update：
     WindSystem   （阵风噪声 → 布料 uniform，CPU 零逐顶点）
     ParticleSystem（发射/回收/淡入淡出）
     LightBreathSystem（呼吸/闪烁/旋转 + 当前通道功率）
     AtmosphereSystem（云影移动、雾微动）
     EventScheduler  （偶发触发检查）
④ 场景帧驱动：lightHooks.update?() + SceneAnimation[]（海面波光、灯塔、海鸟…）
⑤ Engine.render：主 pass（卡通材质）→ OutlineSystem 反壳 pass → 可选 postfx
```

#### 3.5.3 四维切换的更新路径（六.5）

**过渡时长定值（决策 D5）**：时间切换与天气切换一律 **1500ms**（四-5「1~2 秒」区间内取中，五-6 同标准）；场景与车型切换 **600ms** 短暂淡入淡出。装饰物离散状态（餐具出现/帆船移位）在过渡中点 blend≥0.5 时切换，并对新增物做 0.2s 透明度短淡入——可连续量（亮度/位置/雾）全程随 blend 插值。相机（轨道角/距离）四类切换全程不动（六.5「连续、不打断观看」）。

```
【时间切换】State.time 变更
   → TransitionController 启动 1500ms 交叉淡入淡出（光照参数线性插值，非双 pass 混合）
   → 每帧插值后的 GlobalLightParams → render/lighting + sky + Atmosphere
   → 插值后的 SceneLightState → scene.lightHooks.applyLighting(state, blend)
                              → vehicle.interiorLightHooks.applyInteriorLight(power, emphasis, blend)
   （一帧内完成，无重装配，成本最低）

【天气切换】State.weather 变更
   → 1500ms 过渡：ParticleSystem 旧粒子淡出/新粒子淡入（雨↔雪↔无）
   → WeatherMaterialSystem 把 material 七分量插值写入共享 uniform
   → WindSystem.setWind(windMul × 阵风基准)（风力平滑趋近，不跳变）
   → lightMod 乘入全局光照（夜间浓雾 = 更暗 + 更强光晕）

【场景切换】State.scene 变更（最重路径）
   → 600ms 淡出旧场景组，期间分帧构建新场景（构建分散到 ≤3 帧，避免掉帧尖峰）
   → 卸载：旧场景全部句柄从 Wind/Particles/Breath/Material 反注册；assets 引用计数释放；
     SceneAnimation.dispose()
   → 装配：BaseAssembler(新 baseStyle) → buildTerrain → buildProps → 注册句柄 → createAnimations
   → 用当前 time/weather 立即 applyLighting(blend=1)（新场景直接呈现当前组合的完整状态）
   → vehicle 按新 campAnchor 重新对位（接地高度/朝向，三·总则「轻微适配」）
   → 600ms 淡入；相机不动

【车型切换】State.vehicle 变更（次重路径）
   → 600ms 淡出旧车型 → 反注册其 cloths/lamps → dispose
   → 新车型按当前 campAnchor 对位 → interiorLightHooks 立即按当前时间档应用 → 600ms 淡入
```

**数据流总图**：

```
Registry×4 ──注册──▶ main.ts(组装点) ──▶ Director(装配/卸载/编排)
                                          │
        ┌─────────────────────────────────┼──────────────────────────────┐
        ▼                                 ▼                              ▼
  SceneModule(五部分)              VehicleModule(四项)        TimePreset / WeatherPreset(数据)
        │ cloths/lamps/emitters/surfaces │ cloths/lamps              │ 经 TimeLight/WeatherMaterial
        └────────────┬───────────────────┘                           │
                     ▼                                               ▼
   Wind / Particles / Breath / Material(公共系统，RhythmClock 节奏) ← 语义通道 + 光照/材质修正
                     │
                     ▼
   每帧：Clock → Transition → Systems → SceneAnimations → Engine.render(Toon + Outline)
```

### 3.6 扩展示例（验证 2.5 / 3.6 硬性要求）

**新增场景（例「湖畔营地 lakeside」）**：①新建 `content/scenes/lakeside.ts` 实现 SceneModule 五部分（仅新文件）；②新部件进 `geom/parts/`、重复元素走 InstancedGroup（仅新增部件文件）；③`sceneRegistry.register(lakeside)`（仅 registry 一行）；④UI 按钮、组合标题、切换逻辑、营位对位**自动生效**（零改动）。不改动清单：`core/` 全部、`render/` 全部、`systems/` 全部、`ui/` 全部、其余 4 场景——满足 2.5「新增场景不应修改核心渲染与切换代码」。

**新增车型（例「皮卡+露营拖车 popupTrailer」）**：①新建 `content/vehicles/popupTrailer.ts` 实现 VehicleModule 四项；②registry 一行；③任何场景落位、接地适配、时间档车内灯、雨天布料下凹**自动生效**。不改动清单：同上另加全部场景文件（场景只提供 campAnchor）——满足 3.6「新增车型 = 新增模块并注册，不修改核心逻辑」。

### 3.7 性能策略落点（八.3「中端笔记本 60fps」）

| # | 措施 | 架构落点 | 说明 |
|---|---|---|---|
| 1 | 几何/贴图共享缓存 | SharedAssets（GeometryCache+TextureCache，引用计数） | 同 id geometry 全局共享，切换不重复建模 |
| 2 | 强制实例化 | `InstancedGroup` | 松树、礁石、集装箱、行道树、桌椅、沙袋、串灯灯泡、雨雪粒子——重复元素一律实例化，每种 1–2 draw call |
| 3 | 材质工厂+缓存 | ToonMaterialFactory | 卡通材质、ramp、描边壳统一创建；同参数命中缓存 |
| 4 | 描边层节流 | OutlineSystem 物体级 noOutline | 反壳使 DC 加倍：轮廓强物体开描边，细碎小物关闭 |
| 5 | 实时灯光上限 | render/lighting.ts 灯光预算 | 全局仅 1 方向光（日/月共用）+1 hemisphere+≤2 点光（车内暖光、火光）；其余灯点 emissive+additive 光晕 sprite |
| 6 | 阴影预算 | 单张 2048 shadow map，仅方向光 | 时间切换只改光源矩阵与颜色，不重建阴影链 |
| 7 | 动效 shader 化 | Wind/Atmosphere/波光/光斑全走 shader 时间相位 | CPU 每帧只写 uniform；粒子 GPU Points/InstancedBufferGeometry |
| 8 | Draw Call 预算 | Engine dev 计数器（仅开发模式） | 每组合目标 ≤200（含描边壳与粒子）；parts 层是合批唯一收口 |
| 9 | 分辨率与后处理降级 | pixelRatio clamp ≤2；postfx 可关 | 预算不足先降后处理再降 pixelRatio |
| 10 | 切换不卡顿 | Director 分帧构建（≤3 帧） | 六.5「短暂过渡」不被装配尖峰打断 |

### 3.8 关键决策与遗留

关键决策 D1–D8 见一.12 汇总表；遗留确认项 Q1/Q2/Q3/Q5/Q6 亦在该表（Q4=动效参数定值，已由第七章参数表承担）。

### 3.9 接口增补决议（合并期汇定，实现期一次性并入 types.ts，T04 落地）

| 来源 | 增补 | 说明 |
|---|---|---|
| M1（时间天气章） | `ClothHandle` 增可选 `windFactor`（默认 1）/`sagAmp`（默认 0）/`dripAnchors` | 支撑五-3 下凹/滴水与车内布料弱风 |
| M2（时间天气章） | `LampHandle.params` 增 `pattern:'rev'|'sweep'` 与 `floor` | 探照灯扫动、售货机常亮下限 |
| M3（时间天气章） | `EmitterSpec` 字段明细化（lifetime/size0/size1/vel0/color/opacity/additive） | 粒子参数表落地 |
| M4（时间天气章） | `WeatherSurface` 增可选 `snowShell`；灯点增 `castReflection` | 雪壳覆层与雨天镜面反光条注册挂点 |
| P1（场景章） | ParticleSystem 每注册 EmitterSpec 返回实例句柄 `setRate()` | 炊烟/蒸汽/火星/微尘强度随语义通道逐帧调制 |
| P2（场景章） | WindSystem 暴露全局风向/风力 uniform 供植被材质 onBeforeCompile 注入 | 松针 7-2-①、行道树 7-4-⑤、海草——植被摆动与布料同一风力源 |
| P2b（场景章，可选） | WindSystem 阵风 gust 事件广播 | 7-1-⑦ 纸巾轻掀触发点；无此事件靠阵风噪声自然驱动（可接受降级） |
| P3（场景章） | 全局灯架预留 1 个可分配「火光点光」挂点 | 灯光预算 ≤2 点光中的火光位（松林篝火/避难所火堆/海崖烧烤炉） |
| P4（场景章） | AtmosphereSystem 接受 `palette.baseFog` 分量输入；雾板 α 联动值（fogDensity 归一）可被场景读取 | D6 公式输入口确认 |
| 车型章遗留 10 | 外饰灯（尾灯/示廓/探照灯）目前随 interiorPower 调亮；若需「外灯常亮、内灯随时间」分离需扩通道 | **接口变更挂起**，实现期评估，不擅自扩 |

---

## 四、模块实现方案（场景 / 车型 / 时间 / 天气）

> 依据原文 2.1–2.5（场景）、3.1–3.6（车型）、四节（时间）、五节（天气），按 **场景×4 → 车型×5 → 时间 → 天气** 分小节，逐场景、逐车型说明。坐标约定：底座台面 y=0、+x 右、+z 朝观众、−z 远端，单位 u（1u≈1m 微缩观感）；底座 20×20u（★尺度统一口径，见一.12）。

### 4.0 四域共通约定

- **统一正方形底座（一·3）**：BaseAssembler 统一骨架——底边 20u×20u、台面 y=0、底座厚 1.5u、四周 45° 倒角台缘 + 底缘内收 0.15u「模型剖面」阶梯、底面 19.2×19.2 深灰托板；场景只经 `palette.baseStyle`（J1：topTheme/edgeMatId/rimDecal/skirtLayers/silhouette）换材质与边缘。
- **分层底座与远景收纳（D1）**：下沉层（海面/溪谷/公路）由 `buildTerrain` 声明，边缘 0.25u 过渡斜坡；后缘剪影板（Canvas alpha 剪影，随全局光照同色调，浓雾按 fogDensity 逐层雾化）；任何远景元素不越出 20×20 底座。
- **程序化建模字典（八.2/八.3）**：基本体（Box/Cylinder/Sphere/Cone/Torus/Capsule/Plane/Dodecahedron/Icosahedron）、Lathe（旋转体）、Extrude（侧影/剖面拉伸）、Tube+CatmullRom（管线/绳/护栏）、InstancedGroup（同类 ≥3 必实例化）、Canvas/SVG 贴图工厂。
- **不要人物（一·6 硬红线）**：`geom/parts/` 全库禁止人形几何；海鸟/松鼠为原文点名动物动效载体不属人物；帆船空船自动航行；残骸无乘员无骸骨；店内只有货架/桌椅剪影无人形剪影；警示牌不用骷髅图形。
- **三渲二材质参数（一·2/八·2）**：全部经 ToonMaterialFactory——建筑大面 3 阶开描边、植被 2 阶（alpha 面关描边防白边）、细碎小物 2 阶关描边、自发光 MeshBasic+additive、水面 2 阶+波光层、玻璃半透 toon+内衬 emissive。详见第五章。
- **句柄接入（D3）**：布料一律 `ClothHandle`→WindSystem（场景不写布料代码）；粒子一律 `EmitterSpec`→ParticleSystem；灯点一律 `LampHandle`→LightBreathSystem（相位取 RhythmClock）；天气作用面一律 `WeatherSurface`（ground=湿润/薄雪、roofTop=顶部积雪、clothTop=布面下凹+积雪、linePaint=划线 lineFade）。

### 4.1 场景模块（4 个）

#### 4.1.0 共通约定

**campAnchor 四场景取值**（三·总则「任何车辆停任何场景中央营位」；车型按此对位并可轻微适配）：

| 场景 | position | headingRad（0=车头朝 −z） | groundY | radius | 营位说明 |
|---|---|---|---|---|---|
| 海崖 | (0, 0, 0.8) | +0.30（车头略朝海偏右） | 0 | 4.0 | 草坪营位，四周留观海视线 |
| 松林 | (0.4, 0, 0.2) | +0.20 | 0 | 4.0 | 碎石营位；木质平台在侧后方供生活区，车辆不停平台上（J2） |
| 避难所 | (0, 0, 0) | −0.40（车头朝围墙开口） | 0 | 4.0 | 硬化地面，开口朝 +z 前侧 |
| 服务区 | (0, 0, 3.4) | 0（顺大车位长轴） | 0 | 4.2 | 划线大车位 9×5.5，长轴沿 x（A型回调后车长 7.9，车位余量 1.1） |

（★半径契约仲裁：车型尺寸以本表为准回调，拖挂组合与 A型目标外接半径 ≤4.2——A型 7.9×2.7≈4.18；二者在 4.0 半径营位仅告警不阻断，见一.12。）

**baseStyle 差异表**（形式统一、材质与边缘不同——一·3 后半句）：

| 场景 | topTheme | 台缘 edgeMatId | rimDecal | skirtLayers | silhouette |
|---|---|---|---|---|---|
| 海崖 | `lawn`（草地噪点） | 岩层剖面（三条沉积层带） | 无 | 1（海面下沉 −2.6） | coast |
| 松林 | `gravel`（碎石地） | 根系土层 | 无 | 1（溪谷下沉 −1.6） | mountains（层叠山脊两层板） |
| 避难所 | `crackedConcrete`（裂纹混凝土） | 混凝土毛面 | 黄黑警示斜纹（四角） | 0 | bridge+skyline |
| 服务区 | `asphaltLot`（沥青+划线区） | 路缘石 | 无 | 1（公路下沉 −0.12） | 无 |

**复用部件库新增清单（geom/parts/，铁律：禁止任何人物几何）**：`treePine`（松林首创，服务区/海崖复用）、`treeRound`（服务区）、`grassTuft`、`rockCluster`（避难所首创，松林/海崖复用）、`drumBarrel`、`woodSign`、`waterSurface`（海崖首创，松林溪流复用）、`campfire`（松林首创，避难所油桶烤架变体）、`benchSlat`/`foldChair`/`foldTable`（海崖首创，服务区复用）、`bicycle`（车型章 3.2/3.3 经 assets 取用）、`clothMicro`（微布料快捷工厂）、`signBoard`、`gardenHose`。

#### 4.1.1 场景一 · 海崖营地 seacliff（默认场景，原文 2.1）

**模块卡**：文件 `src/content/scenes/seacliff.ts`；id/label/isDefault = `'seacliff'/'海崖'/true`；实现 SceneModule 五部分；依赖部件 waterSurface/rockCluster/treePine(零星)/benchSlat/foldTable/foldChair/clothMicro/signBoard/gardenHose/bicycle/campfire(烧烤炉变体)；元素 15 组 / 动效 7 项。

**地形与构图（2.1.1）**：草坪台体 Extrude（崖缘为 bezier 曲线 `z=-5+1.2·sin(0.5x)`，右侧在小海湾处凹进），沿 −y 拉伸 2.6u，侧壁 3 条沉积带贴图+2 片错位薄板「层蛋糕」崖壁；海面 waterSurface（y=−2.6，近岸渐变顶点色+2 层 additive 波光面）；小海湾（沙地 y=−1.9+湾水 y=−2.3）；石阶下行槽；崖缘浅草压边。车辆位于 (0,0,0.8)。

**道具清单（buildProps，2.1.2 十五组逐组）**：

| # | 道具 | 建模与句柄要点 |
|---|---|---|
| ① | 遮阳天幕与折叠桌椅 | 天幕 Plane(3.2,2.6,12,8) 预置下垂+4 杆+guy 绳；**ClothHandle**(stiffness 0.35)+**WeatherSurface clothTop**；桌椅复用 foldTable/foldChair，椅×2 实例化 |
| ② | 串灯 | CatmullRom 悬链 3 段+灯泡实例化（14 泡+halo 成对，1–2 DC）；**LampHandle blink 3s depth0.3 stagger0.4rad**（7-1-①，★统一节奏） |
| ③ | 烧烤炉 | Lathe 烤碗+盖+3 腿+炭；炊烟 **EmitterSpec steam**（rate 受 smokePower） |
| ④ | 野餐垫 | gingham 格纹 Canvas；纸巾 **ClothHandle**(stiffness 0.85)（7-1-⑦）；垫顶 clothTop；**早餐餐具 `breakfastSet`**（J4 主展示位：盘×2+杯×2+壶） |
| ⑤ | 小营地灯 | Lathe 灯笼罩+emissive 内芯；**LampHandle breath 1.5s depth0.55→steady**；清晨 0.15「将熄未熄」（四-1） |
| ⑥ | 防水地垫 | Box+棱纹；**WeatherSurface ground** |
| ⑦ | 水电桩与管线 | 桩+卷盘+Tube 管线；**管线止于营位边缘地环不接触车型（J8 解耦）** |
| ⑧ | 小型折叠自行车 | bicycle 部件（车型章复用） |
| ⑨ | 木栈道 | 板 ~36 沿路径实例化；栈道顶 **roofTop**（积雪） |
| ⑩ | 崖边护栏 | 桩 ~14+扶手/中横杆 Tube 沿崖缘；顶杆 **roofTop**（五-5 护栏积雪） |
| ⑪ | 观景长椅 | benchSlat（面海放置） |
| ⑫ | 路牌 | signBoard 双板；SVG 文字「潮見岬／Shiomi-misaki」「Sea Cliff Camp →」（J6） |
| ⑬ | 海草与礁石 | 礁石 ×12、草簇 ×20 实例化；海草走植被风摆通道（P2） |
| ⑭ | 通往小海湾的石阶 | 之字台阶 ×22 实例化+休息平台板 |
| ⑮ | 帆船与防波堤灯塔 | **帆船 named `sailboat`**（Lathe 船壳+桅杆+主帆/前帆）；防波堤两段+乱石；**灯塔** Lathe 收腰塔身红白环带+红锥顶+灯室；**LampHandle rotate 0.25rad/s**（≈25s/圈，7-1-④★）+2 对置光束锥 additive，可见度受 lampPower |

**色彩基调（palette，2.1.3）**：`colorChannels` 12 通道——seaDeep `#2c4a7c`、seaShallow `#4a7fb5`、seaGlint `#b8d8f0`、grassLawn `#86b05c`、grassDry `#a8b86a`、cliffRock `#9a8672`、cliffStrata `#7c6a58`、sandCove `#e0cf9d`、woodDeck `#b98a58`、canvasTarp `#f2e9d4`、lampWarm `#ffcf8a`、sailWhite `#f5f2ea`；`baseFog 0.10`；baseStyle 见 4.1.0。冷暖对比口径：暖侧=lampWarm 通道（串灯/营地灯 emissive+车内衬光 interiorGlow），冷侧=seaDeep/seaShallow 受夜间蓝紫调制，黄昏 GlobalLightParams 天空端点（金橙→蓝紫）夹持。

**光照钩子行为表（lightHooks.applyLighting，覆盖四-1/2/3/4 海崖专属表现；通道为全局定值见 4.3.2，本表为场景解释结果）**：

| 状态 | 清晨 | 白天 | 黄昏 | 夜间 |
|---|---|---|---|---|
| 灯点（串灯/营地灯/灯塔） | lampPower 0.15 将熄未熄；灯塔未工作 | 0 全熄 | **串灯点亮、灯塔开始工作**（beam 0.4） | 全部点亮+柔和光晕（beam 1.0） |
| 早餐餐具 | **出现**（α 淡入 0.2s） | 收起 | 无 | 无 |
| 帆船 `sailboat` 位置 ★ | **刚刚出海**：近岸 (−2, −5.6) 微摆 | 远海 (−4.5, −8.2) | 远海缓行 (2.5, −8.6) | **归港**：防波堤内侧 (−6.2, −8.4) 静泊（泊港灯点微亮） |
| 波光色/朝霞 | tint 偏晨金（朝霞由 sky.ts 全局承担） | 中性 | 金橙粼光 | 月光带（α×0.7） |
| 帆船起伏（lightHooks.update） | y=0.03·sin(0.9t)+0.02·sin(1.7t)、roll=0.04·sin(0.6t)；泊港幅度×0.4 | 同左 | 同左 | 同左 |

**天气作用面（五-2/5-3/5-5）**：多云=波光 α×0.7+风力×1.2；小雨=草坪/地垫湿深反光、天幕积水微下凹、栈道反光、天幕前缘滴水（drip emitter）；浓雾=海天边界糊化+灯塔光晕 glowBoost；降雪=草坪薄雪、天幕/护栏/桌椅顶积雪（枚举部位全覆盖）、海面不封冻（B7）。

**注册表接入与预算**：`sceneRegistry.register(seacliff)`（isDefault）；buildProps 交出 `named{sailboat, breakfastSet}` + 2 cloths + 3 lamps + 2 emitters + 5 surfaces；Draw Call ≈115 ≤200。

#### 4.1.2 场景二 · 山间松林营地 pineforest（原文 2.2）

**模块卡**：`pineforest.ts`；label「山间松林」；依赖 treePine/rockCluster/waterSurface/campfire/clothMicro/signBoard/grassTuft/benchSlat；元素 12 组 / 动效 7 项。

**地形与构图（2.2.1）**：碎石台体 Box(20,1.5,20)+gravelNoise；溪谷俯视 Shape Extrude 下拉 1.6u（宽 2.2u 斜带穿左后角）+溪流 waterSurface（y=−1.35，流向沿谷向）；松林环带 `treePine` ×38（3 档高 3.2/4.2/5.2u ×3 色档，单树=干+**3–4 层叠 Cone 树冠**「树冠层叠」落实，按档位分 3 组实例化）；锚树 ×2（承担吊床/晾绳挂点）；后缘山脊剪影板 ×2（h 4.5/3.0）；山腰云带 billboard ×3（y 3.0/3.6/4.2）。

**道具清单（2.2.2 十二组逐组）**：①吊床（Plane 顶点预弯垂弧+绑绳；**ClothHandle** stiffness 0.3，7-2-⑤）；②篝火堆+环形原木凳（石圈 ×10+原木凳 ×6+柴堆；火焰 SceneAnimation+**EmitterSpec spark** 6×emberPower/s+火光点光挂点 P3+LampHandle 呼吸快相位）；③木质营位平台+木阶步道（板格 4.6×3.8，车不停平台上 J2；平台顶 roofTop）；④山涧小溪+跨溪小木桥（纵梁+桥板 ×8+扶绳；桥面 roofTop；落叶 leaf 粒子）；⑤指路木牌（3 块箭头板「滝の道 0.8km／山小屋 2.5km／キャンプ場」J6）；⑥鸟屋+防熊食物储藏箱（挂锚树干 h1.5 / 平台边）；⑦苔藓蕨类蘑菇丛（各 1 组实例化；蘑菇红帽白点，干净治愈）；⑧柴堆（金字塔 ×6 组实例化）；⑨晾晒毛巾 ×3（**ClothHandle ×3**+clothTop；清晨露水感高光=uDew emissive 微青）；⑩打水桶与水瓢（Lathe 桶+半球瓢）；⑪山脊剪影+山腰云带（named `mistBillboards` 供钩子调 α）；⑫林间斑驳光斑（10 片 additive 贴地，named `lightSpots`，合并 1 DC）。

**色彩基调（2.2.3）**：forestGreen `#3f7a4a`、canopyDark `#2f5e40`、canopyLight `#6aa25c`、trunkBark `#6d523c`、gravelGround `#9aa08e`、streamBlue `#6fb5c8`、mistCyan `#cfe4e6`、mushroomRed `#c8493f`、campfireOrange `#ff9a4a`、sunSpot `#fff3c8`（黄昏→`#ffd9a0` 金）；`baseFog 0.32`（四场景最高）。「光斑与雾气随时间变化」口径：光斑按时间档调制（清晨跳动/白天清晰/黄昏金/夜间微弱）；雾气=baseFog × 时间雾档 × 天气 fogMul（D6 单通道）。

**光照钩子行为表（松林专属）**：清晨=**流动晨雾**（雾板 α0.5+mist 粒子 1.5/s）+**鸟鸣般光斑跳动**（songBurst：平均 9s 一次、0.9s 窗内 3~5 个 ~4Hz 快脉冲，纯视觉 Q1）+毛巾露水+篝火余烬 0.5；白天=光斑清晰、雾退、篝火熄火冒炊烟（smokePower）；黄昏=**逆光剪影**（canopyDark×0.55+边缘 rim）+**金色光斑** `#ffd9a0`+篝火全开；夜间=月光斑 0.06、篝火唯一暖光源主调。

**天气作用面**：多云=风力×1.2+云带 α+0.15+云影；小雨=碎石地湿深、平台/桥积水、毛巾下凹、树冠滴水 drip ×2（平台沿/桥沿，rate 2.5/点，7.1.3）；浓雾=山脊剪影逐层雾化+glowBoost；降雪=树冠积雪（snowable 材质）、平台/桥/石顶薄雪、地面覆雪、溪流不封冻。

**注册表接入与预算**：`sceneRegistry.register(pineforest)`；交出 `named{campfire, lightSpots, mistBillboards}` + 4 cloths + 1 lamp + 5 emitters + 5 surfaces；SceneAnimation：光斑摇曳、落叶漂流、松鼠、火焰 4 个；DC ≈135。

#### 4.1.3 场景三 · 末日避难所营地 wasteland（原文 2.3）

**模块卡**：`wasteland.ts`；label「末日避难所」；基调约束=一·5 干净、有秩序感与生活气息的**治愈系末世**（锈而不腐、整齐堆放、无血腥无恐怖）；元素 13 组 / 动效 7 项。

**地形与构图（2.3.1）**：硬化地面整版 crackedConcrete+四角沙地补丁+2 处浅油渍 decal（干净风：小而淡）；半包围工事带（后缘+左右围墙段，**前侧留开口**，campAnchor 朝向对准开口）；后缘双剪影板：bridge（桥面断口 Extrude+3 桥墩+倾斜断段 h3.2）+skyline（8–10 栋低楼群、2:1 高低差、无尖塔，J7）。

**道具清单（2.3.2 十三组逐组）**：①混凝土掩体+防爆门（3 段 Box+顶斜板；门+门轴+**轮盘 Torus**+辐条；hazardStripes 贴条，干净秩序感）；②铁架瞭望塔+探照灯（4 斜腿+横撑 ×8+平台+围栏+爬梯；探照灯灯头+遮光罩；**named `searchlightYoke`**，云台 SceneAnimation+LampHandle 亮度）；③沙袋工事（Sphere 压扁 ×30 错缝码放 2 段矮墙，全实例化，顶面 roofTop）；④锈蚀集装箱 ×2+波纹铁皮围墙（Plane 顶点 sin 波纹板 ×14 实例化；rustPatch 褪色蓝绿+锈 blotch；箱顶/墙顶 roofTop）；⑤缠绕铁丝网（guardNet alpha 贴图网面+卷网筒 ×3+支桩 ×6，实例化）；⑥废旧汽车残骸+轮胎堆（侧影 Extrude+窗洞贴片+缺 1 轮；**无任何乘员/骸骨几何（一·6）**；轮胎 Torus ×5 金字塔；顶面 roofTop）；⑦油桶+手写警示牌（drumBarrel 立3倒1；牌面白底红字「立入禁止／危ない！」手写笔迹 Canvas，**不用骷髅图形**，板微歪 4°，J6）；⑧净水装置+发电机（滤瓶 ×2 半透明+支架+管路；发电机+散热栅+弯头排气管；滤瓶 **LampHandle blink 2.4s**（7.1.4）青 `cyanGlow`「冷色荧光」；蒸汽 **EmitterSpec steam** 常转 base 1.5/s+smokePower 增密 B6）；⑨太阳能板阵列 ×4（倾角 28°，实例化，板面 roofTop）；⑩旋转雷达天线（**Lathe 抛物面**+背筋+馈源；**LampHandle blink 1.2s**；named `radar`）；⑪油桶改造烧烤架火堆（campfire 变体：半砖圈+**油桶剖半**半筒横架+烤网；火光点光 P3+spark）；⑫晾衣绳工装 ×3（ShapeGeometry 剪影双面；**ClothHandle ×3**，七-5「晾晒衣物」枚举）；⑬高架桥+城市剪影（剪影板；窗灯 **shopPower×0.6** 抽样点亮 20%/35%，★统一）。

**色彩基调（2.3.3）**：concreteGray `#9aa0a2`、sandDust `#c9a96e`、rustRed `#a05238`、rustDark `#7c3a28`、containerBlue `#4a6a72`、metalDark `#4a4a50`、fireOrange `#ff8f3d`、beaconRed `#ff5a4a`、cyanGlow `#5ad8d0`；`baseFog 0.14`。**配色纪律（一·5）**：锈红/沙黄饱和度压低 10–15%、无暗黑底色、荧光只做小面积点缀。

**光照钩子行为表（避难所专属，J5/B2 时序）**：清晨=探照灯**换岗快扫**（亮，6s/55°）+警示红灯/天线灯弱闪 0.3+城市微光 0.2+微尘有；白天=**灯具全熄**（探照灯/警示灯/天线灯全灭，四-2）、微尘无；黄昏=**探照灯与警示灯启动**（10s/45°，0.8）+城市窗灯 20%；夜间=全部点亮+glowBoost 光晕（慢扫 14s/40°）+窗灯 35%+月光柱微尘 ×0.7。

**天气作用面**：多云=风力×1.2；小雨=硬化地湿反光+水洼涟漪 decal、工装下凹、檐口滴水 drip ×2、夜间湿地拉出警示红灯与荧光彩色反光；浓雾=高架桥/城市剪影逐层雾化+光柱 α×1.4；降雪=集装箱顶/掩体顶/铁皮墙/沙袋顶/残骸顶/太阳能板积雪、地面薄雪、火堆融雪圈。

**注册表接入与预算**：`sceneRegistry.register(wasteland)`；交出 `named{searchlightYoke, radar}` + 3 cloths + 4 lamps + 4 emitters + 5 surfaces；SceneAnimation：探照灯云台 1 个；DC ≈150。

#### 4.1.4 场景四 · 高速路服务区 servicearea（原文 2.4）

**模块卡**：`servicearea.ts`；label「服务区」；商业照明全部走 `shopPower`（D8）；元素 12 组+送货小车 / 动效 5 项。

**地形与构图（2.4.1）**：柏油停车区整版 asphaltLot；划线整版 decal（白色实线框：**大车位 9×5.5 居中**+4 小车位+导向箭头，线宽 0.07u）=**WeatherSurface linePaint**（降雪 lineFade 特例）；公路主线前缘下沉带（y=−0.12，双向 2 车道黄虚线）=车流动效路径；护栏波形梁 Extrude ×10+立柱 ×11；绿化带+灌木球 ×7。

**道具清单（2.4.2 十二组逐组）**：①加油站雨棚+加油机 ×2（立柱+悬挑顶板+棚下灯板 ×2；加油机+顶灯箱+屏+软管；棚灯=steady×shopPower×0.8（7.1.4））；②便利店+发光招牌（店体 7.6×2.4×3.0 分商店段/食堂段；招牌灯箱 `signText:stationHayabusa`「STATION HAYABUSA／道の駅 はやぶさ」J6；**LampHandle breath 6s depth 0.12 循环微闪**+偶发双闪（EventScheduler 平均 20s±8s，7.1.4/7.1.5-5），均乘 shopPower）；③**自动售货机 ×2（货道排列可见）**（正面玻璃 α0.18；**货道=3×4=12 商品盒真实小几何** 4 色随机实例化 J3；顶部灯带 **LampHandle steady max(shopPower,0.7)** 常亮 B5）；④电动车充电桩 ×2（屏幕+指示灯 blink 2.4s 绿）；⑤餐饮区明亮大玻璃窗（大窗 3.0×1.5+分格条；窗内暖光内衬 emissive+吊灯 3 点+**桌椅剪影 alpha 贴图，无人形（一·6）**）；⑥遮阳连廊+公共步道（柱 ×6+微拱顶板+盲道凸条）；⑦行道树 ×5+绿化带（treeRound 冠 2–3 球叠；**叶片轻摆=P2 植被通道** 7-4-⑤；树冠顶 roofTop）；⑧公路主线+护栏（地形件；护栏顶 roofTop）；⑨高速路牌+出口指示牌（门架式绿牌「出口 12 ↑ E-1」+单柱式「出口 E-28 まもなく」J6；牌面夜间微 emissive，LampHandle steady×shopPower×0.3）；⑩长椅 ×2+分类垃圾桶 ×2（benchSlat 无靠背变体；分类色环）；⑪洗手池（台+盆+弯管龙头+镜背板）；⑫旗杆小旗（clothMicro 橙白双色条；**ClothHandle** stiffness 0.25，7-4-④+七-5「小旗」）；**+送货小车（四-1 清晨专属，named `deliveryCart`）**：平板车+扶手+纸箱 ×3 摞（微歪），清晨便利店门口出现、白天收走。

**色彩基调（2.4.3）**：asphaltLot `#565c62`、laneWhite `#e8e8e0`、storeWarm `#ffd9a0`、signGreen `#1f6e46`、vendingCyan `#6ad0e8`、canopyBlue `#4a7fb5`、treeGreen `#4f8a4f`、curbGray `#8a8f94`、headlightWarm `#fff2d0`、taillightRed `#ff6a5a`；`baseFog 0.08`。「夜间灯光主角」口径：夜间 shopPower=1 灯箱/灯带全亮+glowBoost halo+车流密度 1.0 且前灯拉长 1.3×，构成夜间视觉主体。

**光照钩子行为表（服务区专属）**：清晨=**刚开灯的便利店**（shopPower 0.35）+送货小车出现+车流 0.35；白天=营业亮 1.0（D8：不属于「熄灯」）+车流 0.55；黄昏=**招牌灯箱初亮** 0.65+微闪+**车流渐密 0.8**；夜间=shopPower 1.0+加油棚灯 0.8+车流 1.0。

**天气作用面**：多云=风力×1.2+云影掠过停车区；小雨=停车区/公路湿反光+**夜间灯光彩色反光**+雨棚檐滴水 drip ×2+小旗增雨重；浓雾=高速牌 halo 增大+车流光雾中拉晕；降雪=**车位划线若隐若现（linePaint lineFade）**+雨棚顶/店顶/长椅顶/护栏/树冠积雪+地面薄雪。

**注册表接入与预算**：`sceneRegistry.register(servicearea)`；交出 `named{deliveryCart, storeSign, vendingMachines}` + 1 cloth + 5 lamps + 2 emitters + 6 surfaces；SceneAnimation：车流光轨 1 个；DC ≈150。

#### 4.1.5 2.5 场景扩展能力落实总览

| 原文条目 | 落实 |
|---|---|
| 2.5.1 注册表/模块化 | 四场景各为一个 `.ts` 模块实现 SceneModule，经 `sceneRegistry.register()` 登记 |
| 2.5.2 五部分独立模块 | 五部分与 buildTerrain/buildProps/createAnimations/palette/lightHooks 一一对应 |
| 2.5.3 登记即被识别 | UI 分组按钮/组合标题/切换全部由 `registry.list()` 驱动，场景零 UI 代码 |
| 2.5.4 新增不改核心 | 四场景实现未产生任何对 core/render/systems/ui 的反向依赖；新增场景操作清单=第三章 §3.6；T22 以临时测试场景+git diff 演练验证 |

场景消费面复核：只消费 `SceneBuildContext.{root,assets,rng}`、`SceneRuntime.{wind,particles,breath,scheduler,camera}`；只产出 `campAnchor`、四类句柄+`named`、`SceneAnimation[]`、`ScenePalette`、`lightHooks` 两方法；零 import 车型/时间/天气注册表；`shared/rng.ts` 以场景 id 为种子保证同组合可复现。

### 4.2 车型模块（5 款）

#### 4.2.0 共通约定

- **落位与适配（三·总则）**：每车局部坐标系 +X=车头、+Y=上、+Z=左；对位由 Director 按场景 `campAnchor` 完成（`root.y=camp.groundY`、轮胎外缘最低点=局部 y0；朝向用 `camp.headingRad`，拖挂组合额外 +0.06rad 微调——「轻微适配」示例）；`footprint` 外接半径>camp.radius 时 `console.warn('[vehicle] footprint exceeds camp radius')`，**只告警不阻断**。★尺度统一：底座 20×20u、1u≈1m；★半径仲裁：车型尺寸以场景章营位半径回调（拖挂组合与 A型目标外接半径 ≤4.2；A型 footprint 已回调为 7.9×2.7≈4.18）。
- **程序化建模四大手法**：①圆角盒 `roundedBox`（Shape→Extrude）；②**侧影挤出 `profileExtrude`**（车身侧影轮廓+`Shape.holes` 开窗真开洞——内饰可见性靠真开洞+独立内饰组，不靠假贴图）；③分面拼装（前挡独立面板+Cylinder 开口弧段弧面玻璃）；④Lathe/参数曲面（卫星锅/洗手盆/手冲壶/拖挂前鼻）。
- **透视内饰结构三件套（三·总则「内部可清楚看到」）**：`innerShell` 内衬壳（缩放 0.94、BackSide 暖色、noOutline）保证透窗看到暖色内壁；玻璃 `depthWrite=false`、`renderOrder=20`、DoubleSide；内饰小件一律 noOutline（防透窗描边碎线）。
- **玻璃三档（glassMat）静态基准**：clear opacity 0.24（大面积主窗）、tinted 0.40（前挡/舷窗遮）、porthole 0.30（圆舷窗）——三档为静态基准档位，全车窗 opacity 落在 **0.22–0.40** 同一区间（与 §5.2 原型库 glass 行、§5.5 口径一致）；玻璃自身**不直读时间/天气**（守 D2），但夜间透明度修正经内饰灯光钩子链下发：`applyInteriorLight(power)` 按 interiorPower 把可透视窗 opacity 插值降至 0.22（见 §5.5），车内暖光透出增强四-4/3.1 冷暖对比——驱动源是钩子收到的 power，不是车辆直读时间。**帐帘/纱帘透光**：`emissiveIntensity = 0.55×power` 写入布料材质——黄昏/夜间车内光「透过布料」洇出来。
- **内饰灯光钩子模板（D2 唯一驱动链）**：`applyInteriorLight(power, emphasis, blend)` 统一实现——暖光 PointLight 强度 `1.15×power×emphasis`（全局 ≤2 点光预算中的「车内暖光」位）、glowTags 家具/帘布透光、screens 屏幕自发光标量、lamps 交 LightBreathSystem（gain 增益+RhythmClock 统一节奏）。**五车灯形态拍板（Q6）**：C=小夜灯(呼吸)+顶灯(恒亮)；A=通顶暖色灯带(恒亮)+床头阅读灯(呼吸)+卫浴冷光小灯(恒亮低)；拖挂=车厢顶灯(恒亮)+皮卡仪表微光(屏幕自发光)；B=车内串灯(错相闪烁)+小顶灯；越野=帐篷 LED 灯串(错相闪烁)+驾驶舱屏幕微光+小顶灯(恒亮低)。
- **车辆布料与天气挂点（D3）**：全部布料件建为 `ClothHandle` 交 WindSystem（车辆不写风力代码）；遮阳棚布/帐篷顶布同时注册 `WeatherSurface clothTop`（雨天 `uSag` 下凹）；车顶面板注册 `roofTop`（积雪）。★修正：C 型布料=升顶帐帘带（车内微风 windFactor 0.12）；B 型挂毯按七-5 补注册 ClothHandle。
- **程序化贴图（tex/，全 Canvas，按 id 缓存）**：`texStripeC`（C 型橙青双色带）、`texBodyA`（银白+藏青裙+金线）、`texRetroTwoTone`（B 型波浪双色）、`texStickerDoodle`（4 枚手绘涂鸦：浪线/太阳/仙人掌/VAN LIFE）、`texTrailerBand`（薄荷/粉扇贝边）、`texWoodFloor`（胡桃/橡木参数化）、`texDash`（仪表刻度）、`texScreenNav/texScreenMap`、`texGauze`（纱帘网格）、`texWeaveShade`（编织纹）、`texDustWeather`（**蒙尘预留，默认不启用** Q2）。文字用系统字体栈 fillText。
- **vehicleKit 部件库（geom/parts/vehicleKit.ts，SharedAssets 引用计数跨车复用）**：`wheel(r,w,kind)`（'at' 加 18 只绕周凸块）、`pleatedBand`（风琴褶）、`rollBundle`（收拢布卷）、`awningAssembly`（斜布+八字支撑臂+前垂缘）、`jackLeg`、`ladder`、`roofRack`、`jerryCan`、`toolbox`、`sleepingBag(state)`、`ledString`、`bikeFolding`、`surfboard`、`gaugeCluster(style)`、`screenPanel`、`booksStack(n)`、`plantPot`、`coffeeKit`、`netPanel`、`mapOpen`。铁律：禁止任何人物几何。

#### 4.2.1 车型一 · C型房车 classC（默认车型，原文 3.1）

**外部（buildExterior，3.1-2/3/4）**：主厢体 profileExtrude（侧影含侧窗真开洞贯通双侧，贴 `texStripeC` 橙青双色带）；驾驶舱段 profileExtrude（门窗洞）；**凸头舱 cab-over**（正影挤出 1.5×0.72，C 型标志）；前挡弧玻璃 tinted；侧窗玻璃 ×2 clear（主透视面 3.1-5）；**升顶楔**（三角圆角侧影，展开态抬高 0.42、前倾 8°）+**升顶帐帘带** pleatedBand 环形围合（opacity 0.85+透光 emissive；ClothHandle stiffness 0.9、车内 windFactor 0.12）+收拢卷帘 ×2（俯视可见升顶内）；**侧拓展舱** roundedBox（主厢左壁挖洞，外移 0.95 滑出态）+风琴套+滑轨 ×2；车门/门窗/把手 ×2；后视镜 ×2；组合尾灯 ×2（红低常亮）；示廓灯 ×3；设备舱口 ×2+水电接驳口；轮组 wheel ×4（后双胎）+轮眉 ×4；排气管。PaintSpec 奶油白 #f3ead8、weathering=false；footprint 6.4×2.6（★按半径仲裁可回调）；描边：主厢/驾驶舱/凸头/升顶楔开反壳，玻璃/帐帘/小件 noOutline。

**展开机构（buildDeployment）**：2 个 DeploymentPart——`popTop`（升顶楔+帐帘带+收拢卷，deployAmount 1，静态展开态）、`slideOut`（侧拓展舱+风琴套+滑轨，1）。不做开合动画（原文只要求已展开；数值保留供日后）。

**透视内饰（buildInterior，3.1-6…12 逐项，named 键表）**：`dashScreen` 驾驶舱大屏（screenPanel+texScreenNav）、`gaugeCluster` 仪表+方向盘、`dinetteTable` 卡座餐桌、`dinetteBenchL/R` 对坐卡座、`kitchenSink` 水槽（Lathe 弯龙头）、`stove` 灶台（2 炉架）、`fridge` 冰箱、`overheadCabinets` 吊柜 ×3 连、`bed` 床铺（床箱+床垫+双枕+双色被）、`nightLamp` **温暖小夜灯**、`slideoutSofa` 拓展舱沙发+靠枕、`bookshelf` 书架、`books` 书册 booksStack(9)、`interiorFloor` 地板（texWoodFloor oak）、`ceilLamp` 顶灯——**共 16 个 named 组**（3.1-13 温馨紧凑：奶油木 #d9b98c+暖白+橙点缀，暖光 PointLight 位 (−0.9,1.8,0)）。

**内饰灯光钩子**：lamps=nightLamp（breath，gain 1.0，周期 6s 族，相位取 RhythmClock——7-1-⑥「车内小夜灯呼吸明暗」落点）+ceilLamp（steady 0.55）；screens=dashScreen+gaugeCluster；glowTags=床垫 0.10/帘布带 0.55/innerShell 0.12。黄昏 interiorPower≈0.85 时车内 3200K 暖光域 vs 窗外暮色蓝紫 = 3.1-13「鲜明冷暖对比」。

**布料/天气挂点**：cloths=升顶帐帘带；weatherSurfaces=车顶面板/升顶楔顶/拓展舱顶 roofTop ×3。注册：`vehicleRegistry.register(classC)`（isDefault，label「C型房车」）。

#### 4.2.2 车型二 · A型大巴式房车 classA（原文 3.2）

**外部（3.2-1…6）**：大巴主车身 profileExtrude（前上角大圆角 r0.75 模拟前脸弧；**贯通侧窗带一整条真开洞** 3.2-2，贴 `texBodyA` 银白+藏青裙+金线）；前脸面板+前挡弧玻璃 ×2 tinted；贯通侧窗玻璃 ×2 clear（全车最大透视面）；**车顶空调外机 ×2**（格栅条实例化）+**卫星锅**（Lathe 抛物面 r0.34 仰 35°）；**侧裙储物舱门 ×4**；**侧遮阳棚** awningAssembly(4.2,1.9)（ClothHandle+clothTop）+**电动踏步**（双级展开态）；**车尾自行车架+折叠自行车** bikeFolding；轮组 ×6（后双胎）；尾灯/示廓/后视镜。PaintSpec 银白 #e8ecf0+藏青裙 #24344d+金腰线 #c9a227；footprint 7.9×2.7（外接半径 ≈4.18；★半径仲裁回调：原 9.0×2.7 外接半径 ≈4.70 超出场景章营位半径上限 4.2，车长 9.0→7.9，见一.12 ★-半径）。

**展开机构**：`awning`（遮阳棚整组，1）、`step`（电动踏步，1）。

**透视内饰（3.2-7…12，17 个 named）**：`ringSofa` **环形豪华沙发卡座**（Extrude 弧段外弧 r1.10/内弧 r0.72 跨 210°+弧形靠背+坐垫扇形分段 ×5）、`islandCounter` **中岛厨房**、`fridgeDouble` 双开门冰箱、`islandSink` 水槽、`stoveEmbedded` 嵌入式灶台（4 炉架）、`oven` 烤箱（玻璃视窗+旋钮 ×3）、`cabinetTower` 通顶吊柜（三段叠）、`lightStrip` **暖色灯带**（柜底 emissive #ffc27d）、`woodFloor` 木纹地板（walnut）、`partitionWall` 半隔断（门洞）、`bedDouble` 独立卧室双人床+床头板、`bedLamp` 床头阅读灯、`bathPod` 小卫浴间体（三面板围合）、`basin` 洗手盆（Lathe）、`mirror` 镜、`showerGlass` 淋浴隔断、`showerHead` 花洒。风格（3.2-13）：暖木胡桃 #7a5236+米色皮革+黄铜点缀，「移动小公寓」进深感（内高 2.4 vs C 型 1.9）。

**内饰灯光钩子**：lamps=lightStrip（steady 1.0）+bedLamp（breath 0.5）+卫浴冷光小灯（steady 0.25，#cfe6ee 冷暖层次）；screens=仪表组（'cool'）；暖光 PointLight 位 (0,2.1,0)。

**布料/天气挂点**：cloths=遮阳棚布(stiffness 0.4/windFactor 1.0，7.1.2)；weatherSurfaces=棚布 clothTop+车顶/空调外机顶 roofTop ×3。注册：`classA`（label「A型大巴」）。

#### 4.2.3 车型三 · 拖挂式房车 + 牵引皮卡 trailerRig（原文 3.3，单一模块 D4）

**组合摆位（5.0）**：皮卡在前（车头 +X）、拖挂在后，牵引角≈0°、牵引杆间隙 0.5；组合整体对 campAnchor 居中对位（「车辆位于视觉中心」按组合整体解释）；`footprint`=组合尺寸（★按半径仲裁回调至外接半径 ≤4.2）；灯光/布料/天气句柄由单一模块统一交出。

**外部 · 牵引皮卡（3.3-1）**：皮卡车身 profileExtrude 一次成型（引擎盖→双排舱→货斗侧板；双排侧窗真开洞两扇，深蓝 #2c4a6e）；前挡+前脸分面+弧玻璃 tinted；**货斗载物三件**：行李箱 roundedBox+双绑带、备用油桶 `jerryCan`、柴火 Cylinder ×8 交错实例化；拖钩/A 字牵引杆；轮组 ×4。

**外部 · 拖挂房车（3.3-2…5）**：**流线厢体**（主体 Cylinder 横置+两端球冠+底部削平「罐头火腿」；★两侧大窗洞用分瓣法：上/下半 Cylinder+左右侧板带洞挤出拼装；白 #f6f3ec+`texTrailerBand` 薄荷/粉线）；前鼻（球冠+Lathe 整流罩）；**支撑腿 ×2** `jackLeg` 放下触地；**遮阳棚** awningAssembly(3.2,1.7) 右侧展开（ClothHandle+clothTop）；**燃气瓶 ×2+备胎**竖挂前鼻面；尾部舷窗 ×2（圆盘 Shape+2 圆洞+玻璃圆片 porthole）；侧大窗 ×2 clear（内饰主透视面 3.3-6）；轮组 ×2 单轴+挡泥板。

**透视内饰 · 拖挂厢（3.3-7…10，10 个 named）**：`rearBed` 尾部横置双人床+舷窗、`kitchenette` 一侧紧凑厨房+小水槽+单炉架、`trailerCabinets` 吊柜 ×2、`dinetteBenchF/R` 对坐卡座、`liftTable` **可升降小桌板**（DeploymentPart kind 'other' 升起态）、`bathPartition` 小卫生间隔断、`washBasin` 盆、`toiletBox` 坐便器、`trailerWoodFloor` 地板、`trailerCeilLamp` 顶灯。

**透视内饰 · 皮卡双排舱（3.3-11，6 个 named）**：`pickupDash` 仪表盘（'cool'）、`pickupScreen` 中控屏、`pickupSteering` 方向盘、`rearSleepingBag` 后座睡袋（半卷态）、`rearDuffel` 后座行李、`pickupFloorMat` 脚垫。全模块 named 合计 16。3.3-12「车队式旅居感」：皮卡（载具、冷色仪表）在前开路、拖挂（白色生活舱、暖顶灯）在后跟随，一大一小一冷一暖。

**内饰灯光钩子（Q6 拍板）**：`trailerCeilLamp`（steady 1.0，暖 #ffb066）为组合「车内暖光」主角；皮卡仪表/中控为 screens（微光 0.35）；暖光 PointLight 位于拖挂厢内 (−2.6,1.5,0)。

**布料/天气挂点**：cloths=拖挂遮阳棚布(stiffness 0.4/windFactor 1.0，7.1.2)；weatherSurfaces=棚布 clothTop+拖挂顶弧面 roofTop+皮卡货斗沿口 roofTop。注册：`trailerRig`（label「拖挂房车」★统一）。

#### 4.2.4 车型四 · B型露营面包车 classB（原文 3.4）

**外部（3.4-1…5）**：一厢式车身 profileExtrude（短头圆弧+高顶；大侧窗真开洞，贴 `texRetroTwoTone` 奶油×芥末黄波浪双色）；**升顶（补建 ★）**：楔形 profileExtrude+pleatedBand 帐帘带（依据 3.4-6「掀顶帐帘」透视途径补建，记为解释性补建待用户确认）；前挡大弧玻璃 tinted；大侧窗 ×2 clear；**车顶行李架+冲浪板**（roofRack+surfboard 斜置 6°+双绑带，青绿 #7fb5a3）；**侧遮阳棚** awningAssembly(2.6,1.6)；**后掀式尾门**（弧形，DeploymentPart 'tailgate' 上掀 70° 悬停+液压杆 ×2）+**纱帘**（texGauze 网格 alpha，opacity 0.5，ClothHandle 微摆）；**手绘贴纸 ×3**（texStickerDoodle 切片，rng 固定槽位选 3）；轮组 ×4 白圈复古轮毂。PaintSpec 奶油白 #fdf6e6/芥末黄 #d9a13b；footprint 4.7×2.2 外接半径 2.7（五车最小）。

**展开机构**：`awning`（1）、`tailgate`（后掀尾门+液压杆，1）、`popTop`（升顶楔+帐帘带，1）。

**透视内饰（3.4-7…11，16 个 named）**：`benchL/R` 对坐小卡座、`foldTable` **翻折小桌（半展开态：绕墙侧铰链转 85° 至水平=床板位）**、`bedCushionExt` **可变床结构半展**（座垫滑出 60%+靠背放倒——一车同现「桌半折+垫半展」）、`miniStove` 单孔灶、`miniSink` 小水槽、`miniFridge` 迷你冰箱、`stringLights` **车内串灯**（ledString 沿顶缘双弧 12 泡）、`tapestry` 挂毯（Canvas 几何纹样；★按七-5 注册 ClothHandle 车内微风）、`plantPot` 小盆栽、`coffeeKit` 手冲咖啡具、`booksStack` 散落的书（双叠+1 本斜靠）、`popTopMattress` 升顶床垫（俯视经收拢帘可见）、`woodCounter` 台面、`frontSeats` 前排双座。风格（3.4-12）：芥末黄+奶油+青绿软装，物件带 2~4° 随机偏角「用过的样子」。

**内饰灯光钩子**：lamps=stringLights（**blink 周期 3s 占空 0.6 逐灯相位错开 stagger**——「轻快闪烁」而非爆闪）+车内小顶灯（steady 0.4）；无大屏（vanlife 不设屏，忠实原文清单）；glowTags=tapestry 0.15/纱帘 0.5/帐帘带 0.5；暖光 PointLight (−0.6,1.5,0)。

**布料/天气挂点**：cloths=遮阳棚布(stiffness 0.4/windFactor 1.0)+后纱帘(stiffness 0.35/windFactor 0.12 车内微风)+升顶帐帘带(opacity 0.85；stiffness 0.9/windFactor 0.12 同 C 型帐帘带)+挂毯(stiffness 0.6/windFactor 0.12 车内微风)——均对齐 7.1.2；weatherSurfaces=棚布 clothTop+车顶/行李架/升顶楔顶 roofTop（冲浪板顶面绑带弱化不积雪）。注册：`classB`（label「B型面包车」）。

#### 4.2.5 车型五 · 越野皮卡 + 车顶帐篷 overlandTruck（原文 3.5）

**外部（3.5-1…5）**：硬派皮卡车身 profileExtrude（货斗/双排舱/短引擎盖，双排侧窗真开洞 ×2；军绿 #5b6650/灰黑裙）；**升高底盘**（车身上抬 0.28+外露减震 ×4 斜置+前后下护板——「升高」读法=大缝腔+外露悬挂）；**全地形胎** wheel(0.50,0.34,'at')（18 只绕周凸块，五车最大胎径）；加宽轮眉 ×4+侧踏管；呼吸管（A 柱 3 段弯管）；**车顶行李架平台** roofRack(2.0,1.3)+网格条 ×7；**车顶帐篷（已展开）**：RTT 开启态——基座盒+**上壳斜撑 −165°（形成 12° 顶）**+**下壳水平外伸 1.35**（双壳铰链翻开）+三面褶皱侧布 pleatedBand+前端防雨檐（帐篷顶布 ClothHandle stiffness 0.8+clothTop）；**帐篷边 LED 灯串** ledString 沿下壳外缘 10 灯；**登车梯** ladder(2.1,5) 斜落地；**侧边遮阳幕**（双立杆+斜张 Plane(2.8,2.0)+texWeaveShade α0.6，ClothHandle 0.4）；**货斗四件**：油桶 jerryCan+水箱（透明水位条）+toolbox+折叠桌板（收折态挂斗侧内壁）；**车侧爬梯** ladder(1.7,4)；**车顶探照灯**（前缘灯体+碗口+光晕 sprite）。PaintSpec 军绿+哑光黑+橙警示条；weathering=false（避难所组合也不默认开启 Q2）；footprint 5.2×2.3（帐篷外伸计入视觉外接告警检查 6.6→★按半径仲裁回调）。

**展开机构**：`roofTent`（RTT 双壳+侧布+防雨檐，1）、`awning`（遮阳幕，1）、`step`（登车梯，1）。展开方式差异点：唯一**双壳铰链上翻**机构（C 垂直抬升、拖挂支撑腿、B 后掀）。

**透视内饰（3.5-7…8，16 个 named）**：`dashLCD` 全液晶仪表（宽幅一体屏）、`centerScreen` 中控大屏（竖置）、`gaugeCluster` 方向盘+座、`sleepPlatform` 后座改装平台（放平成床台）、`sleepingBag` 睡袋（摊一半）、`unfoldedMap` 摊开的地图（mapOpen）、`mapRoll` 卷起的地图、`radioHandset` **手持对讲机（Q5：摆放后座的道具，无人持握——一·6）**、`cargoNet` 杂物网兜（顶缘四挂点下垂弧）、`molleBoard` 装备挂板、`floorMat` 橡胶地垫、`crateA/B` 装备箱 ×2、`thermos` 保温壶、`grabHandle` 拉手。风格（3.5-9）：军绿/灰黑/橙警示三色、直线模块化、零软装织物（对比 B 型慵懒布艺）。

**内饰灯光钩子（Q6 拍板）**：lamps=帐篷 LED 灯串（blink 周期 2.5s stagger 错相——原文列在外部清单但为该车灯光主角，按 D2 归入本钩子由 interiorPower 驱动）+车内小顶灯（steady 0.35）+车顶探照灯（steady 0.3，**不给 rotate**——旋转扫动是场景探照灯专属语义，避免与避难所混淆）；screens=dashLCD+centerScreen+radioHandset 小屏（冷青微光，与帐篷暖橙灯串形成冷暖双焦点）。暖光 PointLight (0.6,1.5,0)。

**布料/天气挂点**：cloths=帐篷侧布(stiffness 0.8/windFactor 1.0)+遮阳幕(stiffness 0.4/windFactor 1.0)；weatherSurfaces=帐篷上壳顶 clothTop+roofTop 双注册（既积水下凹又积雪）+车顶平台/货斗盖板 roofTop。注册：`overlandTruck`（label「越野皮卡」）。

#### 4.2.6 五车差异矩阵与「细节量 ≥ C 型」核对（三·总则-4/5）

| 维度 | C 型 | A 型 | 拖挂房车 | B 型 | 越野皮卡 |
|---|---|---|---|---|---|
| 展开机构组合 | popTop+slideOut | awning+step | jackLeg+awning+双体 | tailgate(70°)+awning+popTop | **roofTent（双壳上翻外伸）**+awning(幕)+step |
| 涂装 | 奶油白+橙青双色带 | 银白+藏青裙+金线 | 皮卡深蓝×拖挂白薄荷线 | 波浪双色（奶油×芥末） | 军绿+哑光黑+橙警示 |
| 车身体量 | 中型双层（凸头） | 全场最长单层 | 双体纵列 | 最小圆润一厢 | 高底盘大胎 |
| 玻璃形态 | 弧面前挡+双侧窗+帐帘透光 | 最大贯通侧窗带 | 拖挂侧大窗+圆舷窗×2 | 大侧窗+纱帘网格+升顶帐帘 | 双排四窗全 clear |
| 内饰色板/主角 | 奶油木+暖白+橙；卡座+厨区+床+夜灯 | 胡桃+米皮革+黄铜；环形沙发+中岛+卫浴 | 复古白+薄荷+拼布；横置床+可升降桌板 | 芥末+青绿；半展开变床+串灯+咖啡具 | 军绿+灰黑+橙警示；床台+地图+网兜 |
| 灯光形态 | 夜灯呼吸+顶灯 | 灯带恒亮+阅读灯呼吸+卫浴冷光 | 拖挂顶灯+皮卡屏微光 | 串灯错相闪烁 | 帐篷 LED 串闪烁+屏幕冷光 |

**细节量量化核对（双指标：named 组数≥16 且外部要素行数≥22，基准 C 型 16/22）**：C 16/22（基准）、A 17/24 ✓、拖挂 16(10+6)/25 ✓、B 16/23 ✓、越野 16/24 ✓。任何一车实现时跌破 16/22 即视为三·总则-5 不达标，进 TASKS.md 阻断项。

**注册表接线（3.6）**：五车注册行见 §3.3.3；每车装配时交出 cloths→WindSystem、interiorLightHooks.lamps→LightBreathSystem、weatherSurfaces→WeatherMaterialSystem、windows→Director 记录+glassMat、DeploymentPart→Director 记录、footprint/paint→对位告警/材质参数。车型切换走 600ms FadeSwap+`applyInteriorLight(blend=1)` 立即呈现。扩展验证（3.6-3）=第三章 §3.6 + T28 演练（git diff 为证）。

### 4.3 时间系统（原文第四节）

#### 4.3.1 实现机制：光照预设 + 装饰物状态切换（四·总则、四-5）

两类状态、两条更新路径：**连续量**（灯光颜色/强度、天空渐变端点、雾、灯点功率、帆船位置、探照灯扫速）随过渡 blend∈[0,1] 全程逐帧插值；**离散量**（早餐餐具出现/收起、送货小车出现/消失、篝火余烬色/熄灭色）在 `applyLighting(state, blend)` 内以 `state.time` 为 key 维护 `lastDiscreteKey`，blend 首次 ≥0.5 时切换目标态+0.2s 短淡入（D5）——切换用 opacity 渐变，不用 scale 弹跳（保持「定格陈列感」）。**每场景四档差异最低集合自检口径**（四-总则「不允许只换色调不换内容」）：①天空渐变端点不同；②主光方向/色/影不同；③语义通道值不同；④至少 1 项离散装饰物状态不同。四项齐备才允许勾 TASKS。

#### 4.3.2 四档 GlobalLightParams 定值表（时间光照面）

| 参数 | dawn 清晨 | day 白天 | dusk 黄昏（默认） | night 夜间 |
|---|---|---|---|---|
| 主光源 | 太阳，仰角 9°，方位东 78° | 太阳，仰角 62°，方位南 12° | 太阳，仰角 11°，方位西 262° | 月亮，仰角 42°，方位西南 210° |
| 主光色 | `#A9CFE0`（青金） | `#FFF4E0` | `#FFB35C`（金橙） | `#93A9DC`（月青） |
| 主光强度 | 0.85 | 1.20 | 1.05 | 0.38 |
| hemisphere 天/地 | `#7FA0BC`/`#5E6B5A`，1.0 | `#BFD9EC`/`#8A9478`，1.0 | `#7B87C4`/`#6A5E58`，0.95 | `#35426E`/`#1E2438`，0.7 |
| 天空 zenith | `#4E6E9E` | `#3E86C8` | `#3C4E96` | `#0C1531` |
| 天空 horizon | `#EFC9A0`（朝霞金） | `#CBE6F5` | `#FF8E4F`（晚霞橙） | `#26325C` |
| 额外天空元素 | 朝霞条带 ×3 | 少量白云条带 op 0.25 | 晚霞条带+「蓝调带」（horizon 之上插 `#5A6AA8`） | 星空 900 点+银河带 300 暗点+月面+月晕 |
| fogBase（D6 入参） | 0.18 | 0.02 | 0.06 | 0.05 |
| 阴影（map 2048） | 长·软 radius 4.0 | 短·锐 radius 1.6 | 长·软 radius 3.6 | 中·软 radius 3.0 |

长投影由低仰角自然产生（仰角 9°/11° → 影长 ≈6.3×/5.1× 物高）；蓝调时刻=黄昏天空 horizon 之上 15%~40% 高度带插 `#5A6AA8`；星空/月属 `render/sky.ts` 全局背景（D1）。

**六语义通道全局定值（TimePreset.channels，★全场景统一，场景只做解释）**：

| 通道 | dawn | day | dusk | night | 消费方 |
|---|---|---|---|---|---|
| `lampPower` 营地/装饰灯具 | 0.15 | 0 | 1.0 | 1.0 | 各场景 lamps（7.1.4 表） |
| `emberPower` 篝火/火堆 | 0.5 | 0 | 1.0 | 1.0 | 火焰/余烬/火星/火光点光 |
| `smokePower` 炊烟/蒸汽 | 0.25 | 1.0 | 0.35 | 0.15 | steam 发射器 rate 加权 |
| `shopPower` 商业照明（D8） | 0.35 | 1.0 | 0.65 | 1.0 | 灯箱/售货机/加油棚灯/城市窗灯 |
| `interiorPower` 车内灯 | 0.2 | 0 | 0.85 | 1.0 | `applyInteriorLight()`（D2） |
| `interiorEmphasis` 车内暖光强调 | 0.2 | 0 | 0.7 | 1.0 | 同上（四-4「车内暖光更突出」） |

派生量：`SceneLightState.interiorGlow = interiorPower`，供场景铺暖色窗光贴花。

#### 4.3.3 通用装饰物状态切换清单（8 项，四-1/2/3/4 通用面）

①**营地灯「将熄未熄」**：LampHandle breath 1.5s depth 0.55，清晨功率 0.15 → 亮度 0.07~0.23 起伏；②**篝火余烬**：炭堆 Icosahedron ×4~6+石圈，emissive `#FF5A20` × emberPower 噪声闪烁，火光点光（≤2 预算位）intensity=emberPower×0.6；③**早餐餐具**（J4/B1 四场景就餐面）：geom/parts/tableware.ts 一套（Lathe 盘/杯/壶）共享缓存，仅 dawn 出现（blend≥0.5 淡入 0.2s）；④**晾晒物露水感高光**：共享 uniform `uDew`（dawn=1）——布面顶部镜面窄带+草坪 sparkle 精灵 40~60 个+毛巾/工装本体高光，白天晒干淡出；⑤**灯具全熄+投影清晰**：lampPower=0 时 emissive=0、halo 隐藏（op<0.02 visible=false）；天幕/遮阳棚 cloth `castShadow=true` 且 `customDepthMaterial` 挂同一顶点位移函数（影子与可见摆动一致）；⑥**炊烟/蒸汽白天细节**：steam 发射器 `rate=2.2×smokePower+0.4 /s`（四场景四源：烧烤炉/篝火/发电机排气/餐饮区排气口）；⑦**黄昏「点灯时刻」**：lampPower 0→1、interiorPower→0.85、shopPower→0.65 随 1500ms 过渡上升，halo 同步长大；⑧**夜间全灯点亮+月光星空**：四-4 枚举 8 项灯全亮落点（7.1.4 总表）+每灯 additive halo sprite（scale=灯径×1.6~2.2、op=0.35×lampPower×(1+0.5×glowBoost)）+星空 900 主星/银河 300 暗星+月面 billboard+月晕 ×2.4。

#### 4.3.4 逐场景 × 四时间表现矩阵（场景专属，与 4.1.x 各场景行为表互为详略）

| 场景 | dawn 清晨 | day 白天 | dusk 黄昏 | night 夜间 |
|---|---|---|---|---|
| 海崖 | 青金低角度+朝霞（horizon 金+3 条霞带）+海面反射偏晨金；帆船近岸刚出海；餐具上桌；露水；营地灯将熄；灯塔未工作 | 正午亮短锐影；帆船远海；餐具收；灯具全熄；烧烤炉炊烟 2.6/s | 金橙晚霞+蓝调带+海面蓝紫；暖车窗光贴花 op=interiorGlow×0.35 铺营位地面；**串灯点亮+灯塔开始工作**；篝火/烟 | 月色深蓝紫+星空+月晕；帆船归港+桅灯；全部点亮带光晕；灯塔 beam 1.0 |
| 松林 | 青金穿林+**流动晨雾**+**鸟鸣般光斑跳动**；餐具（原木凳面）；毛巾露水；余烬 0.5 | 正午顶光，斑驳光斑常态 op 0.5；篝火熄火冒炊烟 2.2/s；mist 退 0.4/s | **逆光剪影**（树冠暗部 ×0.55+rim）+**金色光斑** #FFC860 op 0.75；篝火全开+火光点光 | 月光+星空（地面光斑 op 0）；篝火唯一暖光源主调 |
| 避难所 | 青金晨光；**换岗快扫探照灯**（6s/55°）+天线灯 blink+净水 LED 0.4；城市微光 0.2；餐具（板条箱面）；工装露水 | 正午亮；**探照灯熄、警示灯 0**（J5）；蒸汽增密 2.6/s | 锈红沙黄染金；**探照灯 0.8（10s/45°）与警示灯启动**+城市窗灯 20% | 深蓝紫+火光/冷荧光点缀；探照灯慢扫 14s/40°+警示灯 1.0+窗灯 35%+微尘月光柱 |
| 服务区 | 青金晨光；**刚开灯的便利店** shopPower 0.35+售货机灯带 ≥0.7；**送货小车**出现（侧门）；车流 0.35 | 正午亮；送货小车淡出；灯箱营业亮 1.0（D8）；车流 0.55 光流弱可见 | 暖棚灯×冷柏油；**招牌灯箱初亮 0.65**+循环微闪；充电桩 blink；**车流渐密 0.8** | 柏油暗；招牌/售货机/车流为主角（shopPower 1.0+棚灯 0.8+车流 1.0 前灯拉长） |

#### 4.3.5 平滑光照过渡实现（1500ms，四-5、六.5-②）

`TransitionController` 单 pass 参数插值（非双场景混合渲染）：持有 from/to 两组 `GlobalLightParams+channels`，每帧 `b=smoothstep(t/1500)` 输出插值——颜色在线性空间（载入时 `convertSRGBToLinear()`）、主光方向用方向向量 lerp（夹角 ≥120° 兜底四元数 slerp）、阴影只 lerp radius/bias 不重建 shadow map 链、雾每帧按 D6 公式重算；离散量中点切换+0.2s 淡入；**中途改档不跳变**（`start()` 先快照当前插值中间态为新 from）；首帧不播过渡（装配后 `applyLighting(blend=1)` 直接呈现默认组合）；相机全程不动。

```ts
// core/transition.ts（示意，接口与 §3.5.3 一致）
start(to: TimePreset) {
  this.from = this.snapshotCurrent();   // 快照当前插值中间态
  this.to = to; this.t = 0;
}
update(dt: number) {
  this.t = Math.min(this.t + dt, MS);
  const b = smoothstep(this.t / MS);                    // easeInOut
  const g = lerpLightParams(this.from, this.to, b);     // 颜色线性空间、方向 slerp
  TimeLight.apply(g);                                   // 灯 rig / 天空 / 雾基准
  const ch = lerpChannels(this.from.ch, this.to.ch, b);
  const st = buildSceneLightState(g, ch);
  scene.lightHooks.applyLighting(st, b);                // 连续量插值 + 离散量(b≥0.5)
  vehicle.interiorLightHooks.applyInteriorLight(ch.interiorPower, ch.interiorEmphasis, b);
}
```

### 4.4 天气系统（原文第五节）

#### 4.4.1 五档 WeatherPreset 定值总表（三要素：光照修正/粒子/材质状态 + windMul）

| 字段 | clear 晴朗 | cloudy 多云 | rain 小雨 | fog 浓雾 | snow 降雪 |
|---|---|---|---|---|---|
| lightMod.intensityMul | 1.00 | 0.82 | 0.62 | 0.55 | 0.80 |
| lightMod.ambientMul | 1.00 | 1.12 | 0.90 | 1.05 | 1.10（雪面反光提亮） |
| lightMod.glowBoost | 0 | 0.15 | 0.35 | 0.80 | 0.25 |
| material.wetness | 0 | 0 | 1.0 | 0.15 | 0.10 |
| material.puddle | 0 | 0 | 1.0 | 0.20 | 0.15 |
| material.clothSag | 0 | 0 | 1.0 | 0.10 | 0.35（雪压） |
| material.snowCover | 0 | 0 | 0 | 0 | 1.0 |
| material.lineFade | 0 | 0 | 0 | 0 | 1.0 |
| material.fogMul（D6） | 1.0 | 1.15 | 1.35 | 2.60 | 1.40 |
| material.cloudShadow | 0 | 1.0 | 0.70 | 0.50 | 0.60 |
| windMul（→WindSystem） | 1.0 | 1.3（略增） | 1.45 | 0.85（雾天静风） | 1.1 |
| particles | [] | []（云量走 sky） | rain ×1 | [] | snow ×1 |

晴朗=全中性基准（五-1）：时间预设直通生效。

#### 4.4.2 逐天气实现

- **多云（五-2）**：云条带 opacity 0.15→0.55、天空两端色向 `#9AA6B8` lerp 25%（云量+柔化天空侧）；intensityMul 0.82+ambientMul 1.12+阴影 radius 放大 max(radius,3.2)（光照柔化）；**云影地面缓移**——共享 512² fbm 贴图，所有 ground 类 WeatherSurface shader 采样 `light ×= 1−0.28×cloudShadow×fbm(worldXZ×0.08+windDir×t×0.008)`，uv 沿风向滚动（CPU 每帧 1 个 offset uniform）；windMul 1.3（风力略增）。
- **小雨（五-3）**：**雨丝粒子**（细长 quad 0.008×0.14m billboard+速度拉伸，additive `#A8C8E8` op 0.35，v=4.5m/s+风漂 0.3×wind，发射区 3.4×3.4×2.4m，密度 450/s 存活 ≈240）；**地面湿润反光**（albedo ×0.82 湿深+按视线 fresnel 混天空 horizon 色「假环境反射」+高光带 ×(1+3×wetness)）；**夜间彩色反光**=镜面反光条——每盏近地强灯（castReflection 注册，每场景 ≤6 盏）正下方预置竖长贴花 quad 每帧转向相机方位角，颜色=灯色、additive、`op=wetness×功率×0.5`；**水洼涟漪**（每场景预置 5~9 个水洼锚点贴花，`ripple=sin(dist×90−t×3.2)` 调制，水洼面色=当前天空 horizon 色，夜间 mix 灯色 30%）；**布料积水下凹**（clothSag→ClothHandle 顶点位移 `pos.y−=uSagAmp×uClothSag×sagCurve(uv)`+迎风侧偏移；sagAmp：天幕 0.06/A·B 棚 0.05/拖挂棚 0.045/越野幕 0.04）；**屋檐滴水**（drip emitter 两种来源：真实檐口+布檐最低点 dripAnchors；水珠 3m/s 下落，触地 0.25s 扩张环）；雨对全局：sky 向灰 lerp 35%、波光 ×0.9、windMul 1.45。
- **浓雾（五-4）**：**雾主通道**（D6）`fog01=clamp((scene.baseFog+time.fogBase)×fogMul,0,1)` → `FogExp2.density=0.015+fog01^1.6×0.075`，雾色 mix(时间天空 horizon，`#8A94A8`，0.5×cloudiness)；**远景逐层雾化**——后缘剪影板按层深持有 layerFade，`layerAlpha=1−clamp(fog01×layerDepth×1.6,0,0.95)` 远层先没入雾中；**扩散光晕**——glowBoost 0.8 → halo scale ×(1+0.8×glow)、op ×(1+0.5×glow)、光束锥 α ×(1+0.6×glow)；**景深压缩**——FogExp2 密度上升+天空向雾色 lerp 35%+远物 ramp 对比 ×0.7+描边壳透明度 ×(1−0.3×fog01)；**静谧**——windMul 0.85、微尘/落叶 ×0.5、波光 ×0.85。
- **降雪（五-5）**：**雪花粒子**（quad 0.02~0.045m，70% 软圆点+30% 六瓣雪晶，0.55m/s 缓落+横摆 ±0.08m+风漂，密度 180/s 存活 ≈800，op 0.85）；**积雪覆层四种做法**——屋顶/护栏/桌椅顶（roofTop）：预建顶面克隆网格雪壳（法线外推 0.012×snowCover，SnowMaterial 白 toon `#EDF2F9`，visible=snowCover>0.01）；天幕/棚顶（clothTop）：雪壳挂 ClothHandle 之下**继承布料风摆与 sag**；树枝（树冠）：材质级 `snowable` 朝上遮罩 `mix(base,雪白,smoothstep(0.25,0.7,normal.y)×snowCover)`；地面薄雪（ground）：`mix(albedo,雪色,clamp(snowCover×1.4−fbm×0.3,0,1))` 噪声边缘斑驳+fresnel 闪点 ×snowCover×0.3；**服务区划线若隐若现**——linePaint 贴花 `opacity=1−0.85×lineFade`；雪的其他联动：ambientMul 1.10（雪夜不漆黑）、水面不封冻（B7：波光 ×0.85+水色向青灰 10%）。

#### 4.4.3 天气切换过渡（五-6 前半）

时长 1500ms（D5）；WeatherMaterialSystem 对 7 个 material 分量逐帧插值写共享 uniform（与时间过渡同一 smoothstep 机制，两维各自独立、可同时进行）；**粒子交叉淡入淡出**——旧发射器 rate 0.5s 降 0+存量自然消亡+组 opacity 反向淡出，新发射器 rate 0.5s 升满+淡入（雨 life 0.53s 自然死光，雪 life 4.4s 靠组 opacity 兜底；过渡期双组并存存活峰值 ×2 仍在预算内）；**风力平滑趋近** `wind.current+=(target−current)×(1−exp(−dt/0.6))`；云影/积雪/湿润/下凹全部 uniform 插值天然平滑。

#### 4.4.4 天气×时间综合光照合成规则（五-6 后半）

**公式**（TimeLightSystem 每帧执行，先时间后天气）：

```
intensity = time.lighting.sunIntensity × weather.lightMod.intensityMul
ambient   = time.lighting.hemi        × weather.lightMod.ambientMul
glowBoost = weather.lightMod.glowBoost                       （叠加给所有 halo/光束）
fog01     = clamp((scene.baseFog + time.lighting.fogBase) × weather.material.fogMul, 0, 1)   // D6
sky       = time.sky 色向天气灰调 lerp(0.5×cloudiness/雨)
particles = weather.particles ＋ scene emitters（smokePower 等通道调制 rate）
```

主光**颜色/方向不乘天气**（雨雾天太阳变暗不变色，符合三渲二直觉；浓雾「变灰」走雾色与天空压缩）。原文示例复核：「夜间浓雾」=`0.38×0.55=0.21 更暗`+`glowBoost 0.8 更强光晕` ✓；「清晨浓雾松林」fog01=(0.32+0.18)×2.6=1.3→clamp 1.0 封顶但**不叠加发糊**（D6 单通道）✓；「黄昏降雪海崖」强度 0.84、雪壳覆天幕/护栏、波光 ×0.85、串灯光晕+25%、晚霞色相不变（雪不改天空色调仅 ambient 提亮）✓。20 组合速查矩阵（示意值，baseFog 按海崖 0.10）：dawn 0.85→小雨 0.53/浓雾 0.47；day 1.20→浓雾 0.66；dusk 1.05→浓雾 0.58；night 0.38→浓雾 **0.21 最暗档**——全部满足「任意组合均有效」。

---

## 五、三渲二渲染方案

> 依据原文一.2（三渲二六要素）、一.3（底座）、八.2（卡通材质+渐变色阶+描边）、八.3（实例化与 60fps）、八.4（描边公共模块）。落点：`render/`、`tex/`、`geom/instanced.ts`。

### 5.1 渲染管线总览

```
每帧：Engine.render
 ① 不透明 pass：地形/底座/道具/车辆/内饰 —— MeshToonMaterial 系（§5.2.5 原型库）
 ② 描边壳 pass：OutlineSystem 反壳（renderOrder=1）
 ③ 半透明 pass：车窗玻璃（renderOrder=10）→ 天空背景板（renderOrder=-100 背景层）
 ④ 加性 pass：光晕 halo / 光斑贴花 / 湿地反光贴花 / 车流光条（renderOrder=20–30，depthWrite=false）
 ⑤ 粒子 pass：雨/雪/蒸汽等（ParticleSystem GPU Points）
 ⑥ 可选后期：UnrealBloomPass（仅夜间/浓雾启用）
```

- 着色主体：**THREE.MeshToonMaterial + gradientMap（ramp 贴图）**，走 three 内建光照/阴影/雾管线——「卡通材质+渐变色阶」零依赖落地。
- 色彩输出：`outputColorSpace=SRGBColorSpace`、**`toneMapping=NoToneMapping`**——色阶的本质是「色带平涂」，任何 tone mapping 都会把色带压出灰阶渐变；亮度由灯光强度与 ramp 锚色直接控制。
- 亮度/光晕不用 bloom 兜底：所有「灯的亮」由 emissive 材质+additive halo sprite 表达，bloom 只是夜/雾的可选氛围增强（关闭后画面依然成立——降级阶梯第一级）。

### 5.2 卡通材质与渐变色阶

**ramp 规格**：256×4 px RGBA8（高度 4 规避驱动对 1px 纹理的采样怪癖）、`generateMipmaps=false`、LinearFilter（色带边缘 1–2px 自然抗锯齿，「硬但不锯齿」；NearestFilter 留作工厂参数）；生成 API `buildRampTexture(steps)` 按 key 缓存进 SharedAssets，ramp 本体保持**灰度**（色相来自灯光与环境光）。默认三段式 `steps=[{0,0.34},{0.22,0.34},{0.24,0.62},{0.52,0.62},{0.55,1.0},{1,1.0}]`。工厂预置 5 档：`ramp3`（车身/建筑/树冠/大件）、`ramp2`（地面/混凝土/柏油/细碎小物）、`ramp4`（车漆多一档过渡）、`rampSoft`（布料纸张软物，带宽过渡带）、`rampFar`（远景剪影压平 0.72/1.0）。**关键机制**：ramp 只量化直射光，环境光全额叠加——「暗部是什么颜色」由环境光决定。

**冷暖分离（一.2「色彩柔和但富有层次感」）**：亮部色=方向光颜色×ramp 亮带×albedo；暗部色=hemisphere 环境光色×albedo——阴影色相偏移靠灯光分工而非贴图。黄昏海崖=暖橙方向光（日落金橙）+蓝紫 hemisphere（海面蓝紫）→ 亮部金橙暗部蓝紫，即 3.1「暖色车内灯光与冷色暮色海天冷暖对比」的同一机制。各档具体色值由时间章在 `GlobalLightParams` 定（4.3.2 表），本章锁定分工结构。**光比纪律（一.5）**：暗带系数下限 0.34，全场最暗不低于 `#202438` 级深蓝灰——**任何组合不出现死黑阴影**。日/月共用 1 盏方向光：夜间换月色低强度，ramp 机制不变。

**可选增强补丁（onBeforeCompile，每个可独立关闭）**：①RGB ramp（内建 `getGradientIrradiance` 采 `.rgb` 而非 `.r`）——海崖海面/松林逆光剪影等强色相偏移场合；②高光带（Blinn-Phong 硬阈值一档平涂，`uSpecThreshold`）——车漆/玻璃/金属/湿地面；③边缘光 rim（`pow(1−saturate(N·V), uRimPower)` 仅受光侧半量，`uRimStrength≤0.35`）——树冠逆光/车漆夜反缘。用 `material.customProgramCacheKey()` 隔离程序缓存。补丁与 three 版本耦合是头号技术风险：**锁版本+T06 冒烟用例先行**；补丁失败自动降级纯内建 MeshToonMaterial（灰度 ramp+冷暖灯光），画面依然成立。rim 与描边分工：描边是「结构线」、rim 是「受光边缘的光」，并存不混。

**材质原型库（ToonMaterialFactory 12 类，全项目唯一着色路径来源——2.5/3.6「新增不改核心渲染」的渲染侧保障）**：

| # | 原型 id | ramp | 高光带 | rim | 描边 | 典型使用者 |
|---|---|---|---|---|---|---|
| 1 | `paintCar` | ramp4 | ✓强（条状阈值） | ✓(夜增强) | ✓宽 | 五车型车身（albedo←PaintSpec） |
| 2 | `paintTrim` | ramp3 | ✗ | ✗ | ✓ | 保险杠/踏步/行李架/窗框 |
| 3 | `matteProp` | ramp3 | ✗ | ✗ | ✓ | 桌椅/护栏/灯塔体/水泵（默认原型） |
| 4 | `wood` | ramp3 | ✗ | ✗ | ✓ | 木栈道/平台/原木凳/柴堆 |
| 5 | `metal` | ramp2 | ✓硬 | ✗ | ✓ | 集装箱/铁丝网/油桶/瞭望塔（锈迹=噪声 alpha 蒙版**低对比**） |
| 6 | `concrete` | ramp2 | ✗ | ✗ | ✓ | 掩体/底座侧壁/高架桥（噪声幅度 ≤8%） |
| 7 | `groundTerrain` | ramp2 | ✗ | ✗ | 底座外缘✓ | 草坪/碎石/硬化地/柏油（接 uWet/uSnow/uCloudShadow/uLineFade） |
| 8 | `foliage` | ramp3 | ✗ | ✓ | ✓ | 松树冠/海草/行道树/蕨类（顶点摆动由 WindSystem 注入；层叠树冠 2–3 层 albedo ±8% 明度递进） |
| 9 | `glass` | ramp2 | ✓斜条 | ✗ | 仅窗框 | 车窗/便利店大玻璃（opacity 0.22–0.40：静态基准 clear 0.24/tinted 0.40/porthole 0.30，夜间经 interiorLightHooks 取低值 0.22，depthWrite:false） |
| 10 | `emissiveLamp` | 无(unlit) | ✗ | ✗ | ✗ | 串灯/灯箱/售货机灯带/仪表屏/LED（MeshBasicMaterial 系+halo sprite——**灯的唯一真理**） |
| 11 | `water` | 自定义 shader | 波光条 | 菲涅尔 | ✗ | 海面/溪流（1 平面+shader 时间相位，无顶点波动） |
| 12 | `cloth` | rampSoft | ✗ | ✗ | ✓ | 天幕/遮阳棚/纱帘/晾晒物（顶点动画归 WindSystem，本章只供原型与 uniform 挂点） |

原型库新增流程：新内容物无原型可用时在本章评审追加原型行，**禁止内容模块私搭 ShaderMaterial**（依赖纪律）。

**色彩输出纪律**：albedo 饱和度 ≤S:80%；高饱和仅两处——黄昏天空渐变与 emissive 灯色；明度秩序 主体(车)>近景>中景>远景剪影（rampFar+雾实现）；材质内部禁止平滑渐变（除 rampSoft 与天空板）——渐变只属于天空与光晕。

**阴影（配合四-1/四-2「长投影/短而清晰」）**：单张 2048 shadow map 仅方向光投影；shadow camera 正交范围 ≈底座对角（★20×20 底座 → ≈28×28 单位标定，实现期校准）；`bias≈-0.0005`、`normalBias≈0.03`。**阴影静态化**：`shadowMap.autoUpdate=false`，仅在 ①时间过渡进行中 ②场景/车型装配完成 ③布料剧烈切换时置脏——稳态零重绘，是最大单项 GPU 节省。接收面：groundTerrain/concrete/wood/vehicle 接收；foliage 投+收；emissiveLamp/glass/water/贴花/halo 不参与。

### 5.3 描边方案（八.2「反壳描边或后期描边均可」；一.2「清晰轮廓线」）

**选型结论：反壳描边（inverted hull）为主，后期描边仅留备选接口不实现。** 五条理由：①观感正确——微缩陈列盒的轮廓线应像模型厂手工勾线，世界空间定宽近粗远细与实物模型一致，后期描边全线等宽反显「数码感」；②性能结构正确——反壳无全屏 pass，成本线性于开描边物体数可用物体级开关裁剪；后期 Sobel 两张全屏 RT 是纯带宽税且对细碎道具产出噪点双线；③400 组合零分支——反壳随物体走，后期 pass 需为每个组合维护边缘阈值；④依赖可靠——反壳=一个 ShaderMaterial+几何克隆 ~150 行无第三方；⑤后期方案擅长的「内结构线」本项目用不上（无人物、几何程序化偏简洁）。

**实现细则（OutlineSystem）**：

```ts
interface OutlineOptions {
  width: number;        // 世界单位，见 §5.3 档位表
  color?: string;       // 缺省取全局描边色 #2f2a33
  widthMode?: 'world' | 'screen';  // 默认 world（近粗远细）；screen 预留
}
OutlineSystem.enable(obj: Object3D, opts): void   // 克隆壳并随父级变换
OutlineSystem.disable(obj: Object3D): void        // 摘壳；材质工厂也接受 noOutline 标记
```

壳几何直接引用本体 geometry（共享 SharedAssets 缓存），壳材质 `ShaderMaterial{ side:BackSide, 顶点: pos+normal×uWidth, depthWrite:true }`，renderOrder=1；顶点偏移取世界空间法线×uWidth（相机推拉线宽随透视自然变化）；**硬边处理**——需要描边的部件在工厂里按面拆分顶点法线（toNonIndexed 后 computeVertexNormals），平滑曲面保持共享法线；描边宽度上限 0.06 单位；**实例化成对**——本体是 InstancedMesh 时壳同样 InstancedMesh 共享实例矩阵 buffer（每组恒定 2 DC）；noOutline 物体零成本；壳 renderOrder=1 在本体后透明体前。

**描边分级与颜色**：全局描边色不用纯黑，默认 `#2f2a33`（深暖灰紫），暖色主导物体 `#3a2e2a`、冷色主导 `#2a3040`（工厂按 albedo 色相自动三选一）；六.3 UI 细描边取同一色系。宽度档位（★按 20×20 底座、1u≈1m 标定，1080p 常态观察距离约 2–3px，实现期校准）：车辆级 0.020–0.025（视觉主角）、建筑级 0.030–0.050、道具级 0.010–0.016、小件级 0.008（可选）、底座级 0.050（「陈列盒」边线）；**关闭**：远景剪影板（D1，它本身就是轮廓）、玻璃本体、emissive 灯面、halo/粒子/贴花、内饰组、水面。

### 5.4 Canvas/SVG 程序化贴图策略（八.2 末句）

**基础设施**：`createCanvasTexture(key, w, h, draw, opts)` 命中 key 返回缓存；引用计数经 SharedAssets.acquire/release；默认 SRGBColorSpace、anisotropy=min(4,max)、halo/噪声小图无 mipmaps；全局常驻层（ramp×5、噪声库×4、木纹、halo 径向渐变）永不清零。

**三类生成策略**：①图案绘制类（Canvas 2D 路径/文字）——招牌灯箱、路牌、手写警示牌、B 型贴纸、售货机货道面；文字用**系统字体栈**，「手写感」=圆头粗描边+逐字符 ±4° 旋转+基线抖动；文案集中 `tex/signageTexts.ts` 常量表（便于九.3 复盘逐条核对）。②程序噪声类（自写 value noise/fbm ~60 行）——木纹、沥青颗粒、混凝土污渍、草地色斑、锈迹蒙版、星空点阵、海面噪声；以内容 id 为种子，同组合完全一致。③矢量线稿类（SVG 字符串→data URI→Image→Canvas）——交通标志/充电桩符号/卫星锅刻线；SVG 光栅化异步 → `tex/preloadAll(): Promise` 场景装配前 await。准则：默认 Canvas 2D，只有矢量符号才用 SVG。

**贴图显存预算（全组合峰值）**：场景地面 512²×4 ≈5.6MB、车身涂装 512×256×~8 ≈4.2MB、招牌/灯箱/路牌 ~10 ≈1.5MB、木纹/混凝土/沥青 5 ≈0.9MB、噪声库 4 ≈1.1MB、天空/星空 2 ≈3.4MB、ramp/halo/光斑/反光贴花 9 ≈0.4MB——**合计 ≈17MB ≪ 预算 48MB**。

**中值原则（一.2「材质表现干净」）**：图案类贴图以 0.85–1.0 亮度「近白中值」绘制——**明暗不烘进贴图**，全画面明暗只来自 ramp×灯光；例外即语义图形成分（划线、招牌文字、警示条纹）；噪声幅度纪律（混凝土/沥青 ≤8%，锈迹低对比且色相贴基底——一.5 末世也干净）。

**UV 规范与内容红线**：需要贴图的部件在工厂内排好 UV（集装箱六面共用 0–1 区、车身侧面 512×256 横向展开区），贴图一律 ClampToEdge 或显式 Repeat。**不要人物红线（一.6）**：`tex/` 全部生成函数禁止人物/人脸/人形剪影——贴纸主题限定山/海/浪/太阳/字母数字/箭头，警示牌用符号与文字，城市剪影仅建筑轮廓；与 geom/parts 铁律构成几何+贴图双层封禁。

**贴图不动原则**：运行期零 canvas 重绘、零纹理上传——「动」的图（波光/光斑/云影/湿地反光/车流）全部是**静态贴图+shader uv 偏移/时间相位**；划线若隐若现是 uLineFade 乘 alpha；唯一例外：天空渐变随时间档切换重绘 512² canvas 一次（过渡起终点各一次，不在每帧路径）。

### 5.5 色阶与描边在四场景×五车型上的统一与差异

**统一规则（400 组合的不变量）**：①同一套机制（ramp 生成器/12 原型/反壳系统/冷暖分工）全组合唯一；②同一套比例（★1u≈1m、底座 20×20u、描边档位按此标定）；③同一套秩序（明度秩序/无死黑/中值贴图/无渐变滥用）；④底座形式统一——几何由 BaseAssembler 统一，材质配方=顶面 groundTerrain(ramp2+场景地面图)+边缘 45° 倒角环带+外缘描边 0.05 档；`ScenePalette.baseStyle` 只携带通道引用与边缘样式枚举，不含材质代码。

**四场景差异（全部是数据：colorChannels 通道值+贴图 key+原型参数，渲染层零场景分支；通道定值权在场景章，见 4.1.x）**：海崖=ramp3+RGB ramp 补丁（金橙亮/蓝紫暗最强处）+water 波光+晚霞天空板；松林=ramp3+rim（逆光剪影）+foliage 层叠+光斑摇曳+water 溪流；避难所=ramp2 为主+metal 锈迹蒙版+火光/荧光 emissive+探照灯光束锥；服务区=ramp2 为主+灯箱/售货机 emissive（shopPower）+车流光条+湿地反光贴花+uLineFade 划线层。

**五车型差异（PaintSpec/WindowSpec 数据化，新车型永不新增材质原型）**：车漆共用 `paintCar`，差异只在 PaintSpec `{baseColor, stripeSpec?, textureKeys?, weathering?}`（weathering 默认关 Q2）；可透视窗 `WindowSpec`→glass 原型（clear 档静态基准 0.24，**夜间经 applyInteriorLight 随 interiorPower 插值降至 0.22**——车内暖光透出增强四-4/3.1 冷暖对比；车辆不直读时间，power 由 D2 钩子链下发）；内饰组默认 noOutline+不接收方向光阴影；**车内暖光点光**：夜间从点光池申请 1 盏暖色点光（`#ffb26e`，照亮车身周围地面/天幕内侧——「深夜中的温暖焦点」落地）；另一盏留给场景钩子（篝火/探照灯），Director 按优先级仲裁；描边统一车辆档+自动选色；差异强制点（TASKS 勾验）：C 暖白+饰条/A 贯通侧窗长玻璃带/拖挂白色流线壳（ramp4 高光带最亮）/B 双色+贴纸层/越野哑光军绿（paintCar 关高光带变体，参数化实现非新原型）。

**时间维度作用（四-1~4-5）**：清晨低仰角→ramp 暗带面积自动拉大=长投影；白天高仰角→暗带收窄；黄昏=冷暖分工最强档；夜间=月色低强度+emissive×lampPower=1+halo 淡入+点光池启用；1~2s 过渡=灯光/天空线性插值（D5=1500ms），**ramp 贴图与材质在时间切换中零替换**。

**天气维度作用（五-2~5-6）**：WeatherMaterialSystem 把天气参数写入**全局共享 uniform 单例**，工厂经 onBeforeCompile 按引用注入（改一处全场生效）：

| uniform | 语义（原文） | 作用方式 |
|---|---|---|
| `uWet` | 地面湿润反光、夜间彩色反光（五-3） | groundTerrain/asphalt：高光带 ×(1+3uWet)、albedo 加深 10%、色带并档（湿面「镜面平涂」感）；彩色反光=灯点倒影贴花 opacity∝uWet×功率×nightFactor |
| `uPuddle` | 水洼涟漪（五-3） | 预烘水洼 alpha 区+water 原型低配版（涟漪=噪声 uv 扰动） |
| `uSag` | 天幕/遮阳棚积水下凹（五-3） | cloth 顶点 `y−=uSag×f(距骨架距离)`，与 WindSystem 摆动叠加 |
| `uSnow` | 顶面积雪（五-5 枚举全部朝上部位） | 法线朝上遮罩 `snowMask=smoothstep(0.55,0.8,normal.y)`，`albedo=mix(albedo,雪白,uSnow×snowMask)`——一行语义覆盖屋顶/天幕/树枝/护栏/桌椅顶；地面整面 mix |
| `uLineFade` | 车位划线若隐若现（五-5 特例） | 划线层 alpha ×(1−uLineFade×0.85)（服务区 linePaint） |
| `uCloudShadow` | 云影缓慢移动（五-2） | 半透明噪声大 quad，uv 随时间平移，op=uCloudShadow×0.25，1 DC |
| glowBoost | 浓雾/夜间光晕（五-4/五-6） | halo scale ×(1+glowBoost)、bloom 强度 lerp；雾密度走 AtmosphereSystem 单通道 |

所有天气量经 1500ms 过渡插值后写入 uniform——材质零重建（五-6 平滑过渡）。

**400 组合零分支的保证**：组合=场景通道色/贴图×时间灯光与通道×天气 uniform，三者在 ToonMaterialFactory 产出的同一批材质实例上交汇；渲染层不存在任何 `if (scene==='seacliff')`。

### 5.6 实例化与 Draw Call 控制（八.3）

**InstancedGroup 规范**：`new InstancedGroup(geometry, material, {capacity, withShell})`；`add(matrix, optionalColor)`；instanceColor 只做同种个体 ±5% 明度/色相微差（防「复印感」）；`withShell:true` 成对创建壳（共享矩阵 buffer，恒 2 DC/组）；判据：**同类 ≥3 个必实例化**。

**三选一决策树**：同类重复 ≥3 且同材质→InstancedGroup（含壳）；一次性异形小件 ≥5 个同材质同组→mergeGeometries 合并（three 内建 BufferGeometryUtils，随包离线合规）；动态/可开关/需独立动效→独立 Mesh。实例化清单示例基线（场景章复核）：海崖=礁石(12)/海草丛/串灯泡/栈道板/护栏柱；松林=松树(38，干/冠分组)/原木凳/蘑菇蕨类/木阶/柴堆；避难所=沙袋(30)/网桩/油桶/轮胎/太阳能板/铁皮板；服务区=行道树(5)/长椅/垃圾桶/雨棚柱/车流光条/商品盒(12)。

**Draw Call 预算分解（最重组合示例：松林·拖挂房车·夜间·小雨）**：底座+地形+水面 6、植被实例组（含壳）12、岩石/道具实例组 14、独立道具 45、车辆本体（含壳）18、内饰两组 16、展开机构件 8、粒子 3、天空板/星空/月/云带 5、halo+光斑+云影+反光贴花 9——**合计 ≈136 ≤200 ✓（余量 30%）**；最重另两组合预估 ≈150–170 同样达标。材质实例预算：**每组合 ≤28 材质实例/≤20 着色器程序**；天气/时间共享 uniform 为模块级单例（切天气改 7 个数字，非遍历材质）。

**renderOrder 与透明排序（防闪烁）**：天空板 −100 / 不透明本体 0 / 描边壳 1 / 玻璃 10 / halo·光斑·反光·云影 20 / 车流光条·粒子 30；同一 renderOrder 内加性元素顺序无关（加法可交换）——透明排序问题被设计掉。

### 5.7 中端笔记本 60fps：性能预算与达标手段（八.3）

**帧预算账本（16.6ms@60fps）**：CPU 逻辑 ≤3.0ms（全为写 uniform/矩阵，无逐顶点 CPU）；渲染提交 ≤2.5ms（≤200 DC）；GPU 帧时间 ≤14ms（1080p、Iris Xe/GTX 1650 档）；阴影重绘稳态 0。

**资源预算**：三角形全场 ≤250k（本体 ≤170k：车辆 ≤45k/场景 ≤125k；描边壳 ≤70k；粒子/天空 ≤10k）；部件分段数在工厂写死（松树 ≤900 tri、礁石 ≤120、桌椅 ≤300、灯泡 ≤48、集装箱 ≤100、车身壳 ≤18k、内饰 ≤12k/车）；贴图显存 ≤48MB（估算 ≈17MB）；halo 总面积 ≤屏 15%；无默认全屏后处理。

**十项达标手段**：①描边分级关闭 ②粒子 GPU 化（雨 ≤600 点/雪 ≤400/尘 ≤80/火星 ≤60/蒸汽 ≤40，全部单 DC Points）③阴影静态化 ④点光 ≤2 ⑤材质/几何/贴图三重缓存 ⑥实例化强制 ⑦动效 shader 化 ⑧DC/材质计数器（dev 模式常显，一.4：不进产物画面）⑨pixelRatio 钳制 `min(devicePixelRatio,2)` 初始再钳 1.75 ⑩切换分帧（场景构建 ≤3 帧+贴图预载装配期）。

**降级阶梯（全自动、无 UI，一.4）**：`L0 全效果（bloom 夜/雾启用）→ L1 关 bloom（halo 仍在画面成立）→ L2 pixelRatio 1.25 → L3 pixelRatio 1.0+远距 halo 剔除`；触发：启动后 4s 滑窗均帧 <50 降一档、20s 复查最多再降一档；**只降不升、全程静默**。bloom 启用条件 `time==='night'||weather==='fog'`，强度随 glowBoost lerp（基线 strength 0.35/radius 0.6/threshold 0.85）。

**验收测量方法（Q6 口径）**：内置 FPS 计（dev 面板含 1% low）+内置浏览器 Performance 工具（**仅内置浏览器调试，九.2，不碰系统浏览器**）；测试矩阵：集显实机 ×最重组合（松林·拖挂·夜·雨/避难所·拖挂·夜·雨/服务区·A型·夜·雨）×1080p；**达标线：稳定 ≥55fps（1% low ≥40）视为达成 60fps 目标**。未实测声明：本文为设计预算，方法在实现阶段执行（T44），结果记入 TASKS.md，超预算按十项手段逐项回收（先 1→2→3）。

### 5.8 材质级动效的实现方式（七-1~7-4 渲染层承担部分）

归属总则（D3）：布料归 WindSystem、粒子归 ParticleSystem、灯效归 LightBreathSystem（RhythmClock 统一节奏）；场景私有编排归 SceneAnimation。本章定义「动的是材质哪些项」：

| 动效条目 | 机制 | 实现方式 | CPU 每帧 |
|---|---|---|---|
| 海面波光粼粼 | water 原型 shader | 两层噪声阈值高光带，uv 反向滚动+菲涅尔混天空色；1 平面 1 DC | 2 uniform |
| 林间光斑摇曳 | 光斑贴花 | Canvas 噪声 alpha 贴图，additive、uv 圆周微移+缩放呼吸，节拍取 RhythmClock | 2 uniform |
| 溪水流光/落叶 | water shader / leaf 粒子 | 流光=uv 滚动同海面；落叶=EmitterSpec 'leaf' | uniform |
| 灯塔光束旋转 | 光束锥+LampHandle 'rotate' | ConeGeometry 开口端+additive 渐隐 alpha 贴图，旋转由 LightBreath 驱动 | 1 矩阵 |
| 探照灯扫动/警示红灯 | 'rotate' sweep/rev + 场景编排 | 光束锥复用；红灯=emissive 球+halo 旋转（billboard halo 不转，转灯体与光斑） | 少量矩阵 |
| 灯箱微闪/售货机常亮 | emissiveLamp×LightBreath | 功率通道=shopPower（D8）；微闪=breath 低幅度 | uniform |
| 车流灯光流动 | 车流光条 InstancedGroup | 细长 additive quad，SceneAnimation 沿公路样条移动循环 | 8 矩阵 |
| 星空/晚霞/月面 | sky.ts | 渐变板换 stops（档切换重绘一次）；星空整层 opacity=nightFactor；月=canvas 圆盘 billboard | 档切换期一次 |
| 云影移动 | uCloudShadow quad | uv 平移 | 1 uniform |
| 晨雾流动 | AtmosphereSystem+mist 粒子 | 本章仅提供雾密度 uniform 消费 | — |
| 微尘在光柱飘浮 | dust 粒子+光柱体 | 光柱=additive 圆柱渐隐；微尘=粒子 | — |

规律：**一切材质级动效=静态贴图+时间相位 uniform**，CPU 每帧只有个位数 uniform/矩阵写入。

---

## 六、UI 与切换过渡方案

> 依据原文六.1–六.5、八.5、一.4；交叉四-5/五-6/七-5/十一.1。落点 `ui/` 四文件 + `core/controls.ts`/`engine.ts`/`state.ts`/`events.ts`/`transition.ts`。红线：运行时不联网→UI 零外部字体/图标包/CDN；图标全部 `ui/icons.ts` 内联 SVG；UI 装饰不含人物/人形。

### 6.1 UI 层位置与数据流

UI 是架构分层中的 `ui/` 层，向下只依赖 `core/`（state/events/registry）与自身文件，**严禁 import `content/`**。内容信息只经两条通路：①**枚举通路**——四套 `registry.list()`（保持注册顺序）驱动分段按钮，**注册表新增一行按钮自动出现**（2.5/3.6「登记即被识别」）；②**状态通路**——`AppState`+事件总线驱动选中态/标题条/过渡触发。点击一次「小雨」的数据流：`ControlPanel` → `AppState.set('weather','rain')`（registry.get 校验、同值 no-op）→ `'state:change'` 事件 → ControlPanel 更新选中态+标题条；TransitionController → 粒子交叉淡入淡出（1500ms）→ WeatherMaterialSystem uniform 插值 → WindSystem.setWind 指数趋近 → lightMod 乘入全局光照 → scene/vehicle 钩子按插值状态每帧下发。

**HUD 纪律（一.4/一.3）**：整个页面 DOM 只有四个固定件——标题条（左上）+控制面板（底部居中）+隐藏钮（右上）+隐藏态幽灵把手（右上）；WebGL 画布不渲染任何文字/徽标/水印；dev 计数器仅 `import.meta.env.DEV` 渲染、产物中不存在；favicon 内联 SVG data URI。

**指针事件分层**：`#ui-root{position:fixed;inset:0;pointer-events:none}`，可交互子元素单独恢复 `pointer-events:auto`——画布在 UI 元素之外的任何位置都可直接拖拽旋转，无不可交互死区。

### 6.2 分组切换控件（六.1）

**形态选型：分段按钮**（六.1「分段按钮或卡片列表」二选一）。理由：①四组常驻可见，400 组合巡游是核心玩法，卡片列表多一步；②分段按钮天然呈现「当前档在序列中的位置」，选中态更清晰；③高度可控满足「小巧克制、不遮挡」。

**布局**：底部居中一块玻璃面板四行（场景 4 档/车型 5 档/时间 4 档/天气 5 档），每行=组名标签+分段按钮组；按钮 64×52px（图标 20×20 上、文字 10.5px 下，≥44px 触控目标）；面板约 420×262px（1080p 占宽 22%）——「小巧」量化口径。**不遮挡模型主体三重保障**：①面板贴底+默认机位把底座主体置于画面中上部（★按 20×20 底座与 radius 重标定，实现期截图校准）；②面板可收起为 40px 页签条（会话内记忆不落盘）；③窄屏自动折叠。

**渲染来源**：按钮顺序=注册顺序、文案=`RegistryEntry.label`、选中态=`AppState` 对账；点击已选中按钮=no-op（同值守卫）。

**图标（ui/icons.ts，D7）**：零图标包零字体零图片资产；统一 `viewBox="0 0 24 24"`、stroke 1.6、round；旋转对称图形**用循环生成**（如 `iconSun(r,rays)` 8 道光芒循环、`iconSnowflake(arms)` 6 臂分叉循环）。21 枚清单（场景 4+车型 5+时间 4+天气 5+UI 3）：场景=崖体波浪/三层树冠/瞭望塔/加油机；车型=C 凸头侧影/长方大巴/皮卡+拖挂胶囊/面包车+冲浪板/皮卡+车顶帐篷；时间=半轮太阳+薄雾/太阳/半轮夕阳+波浪/月牙+星；天气=太阳(r 3.6 与 day 区分)/云朵/云+雨丝/三条错位横线/雪花；UI=眼睛/眼睛加斜杠/收起折角。**全部不含人物/人形（一.6 对 UI 同样适用）**。

**选中态/悬停微动效（六.3）**：只动 `transform/background-color/border-color/color`；hover translateY(-1px)、active scale(.96)、选中 `seg-pop` 回弹（过冲一次）+填充底色+描边+图标强调色**三重信号**（兼容色弱）。**label 短名约定**（★统一）：场景=海崖/山间松林/末日避难所/服务区；车型=C型房车/A型大巴/拖挂房车/B型面包车/越野皮卡；时间=清晨/白天/黄昏/夜间；天气=晴朗/多云/小雨/浓雾/降雪——与原文六.2 示例「山间松林 · 拖挂房车 · 夜间 · 小雨」对齐。

**可达性**：真 `<button>`+`aria-pressed`、分组 `role="group"`+aria-label、`:focus-visible` 焦点环、`H` 键切换隐藏、禁 user-select。

**响应式（<720px）**：面板自动切换「页签条+单组展开」——底部 56px 玻璃条横向 4 个维度页签，点页签弹出对应组分段按钮行（超宽横向滚动）；CSS class 驱动（`.panel.compact`），JS 只按媒体查询加减 class。

### 6.3 当前组合标题（六.2）

位置左上（右上留隐藏钮、底部留面板）；格式 `[scene, vehicle, time, weather].join(' · ')`；分隔点 `·` 用 `var(--accent)` 着色；更新动画=旧文本上移淡出 140ms+新文本淡入 180ms（总 300ms 内，不与 600ms 场景过渡抢戏）；`max-width:46vw` 省略兜底；数据纯来自 AppState+四注册表（不缓存文案副本，label 改名标题自动跟随）；左侧 6px 装饰圆点随时间档变色（无含义，避免变成 HUD）。

### 6.4 磨砂玻璃视觉系统（六.3）

**玻璃基线**：`.glass{background:linear-gradient(165deg, rgba(40,47,78,.46), rgba(21,26,48,.40)); backdrop-filter:blur(18px) saturate(1.45); border:1px solid rgba(255,255,255,.22); border-radius:18px; box-shadow:0 10px 32px rgba(8,12,28,.35), inset 0 1px 0 rgba(255,255,255,.16); color:#eef2ff; font:12px system-ui 栈}`；`@supports not(backdrop-filter)` 降级为 `rgba(20,25,45,.84)` 不透明深底。四关键词各落一属性：半透明（渐变基线）/圆角（面板 18/按钮 9/圆钮 999）/细描边（1px 白 22%）/柔和阴影（大半径低透明+顶部内高光）。

**深色玻璃基线理由**：400 组合中夜/黄昏/浓雾占观感暗色一半以上；浅色玻璃在暗场景会成为最亮块，抢走「车内暖光成为深夜温暖焦点」的主角（四-4）；文字对比按最不利组合校验 ≥4.5:1（WCAG AA）。

**强调色随时间档联动（UI 与三渲二美术统一锚点）**：`state:change{dim:'time'}` 时写 CSS 变量（JS 预计算 rgba 字符串，不用 color-mix）——dawn `#9fd8ff` 青/day `#eaf4ff` 白/dusk `#ffbe6b` 琥珀/night `#b9c8ff` 月白；与 times 预设数据无 import 关系（依赖纪律），色值对齐由评审把关。

**动效降级**：`prefers-reduced-motion: reduce` 下 UI 装饰动效全关（3D 场景过渡不受影响——那是内容本身）。**性能纪律**：同时存在 backdrop-filter 元素 ≤3；动画只动 transform/opacity；严禁动画 blur/shadow/尺寸；`will-change` 仅动画期间。

### 6.5 隐藏 / 呼出 UI（六.4，呼应一.4）

状态机：`visible --点击右上隐藏钮/按 H--> hiding(260ms, 三件同时 translateY(-8px)+opacity→0) --> hidden`；hidden 态唯一残留=右上 30×30 ghost 把手（opacity .22，eye-off 图标；hover/focus 升至 .8；触屏首次进入播一次呼吸提示 2.4s 解决发现性）；showing 反向 300ms ease-out；`visibility:hidden` 保留 DOM（呼出零重建）。键盘 `KeyH`；触屏 ghost 外包 44×44 命中区。**不持久化（U5）**：隐藏偏好与上次组合均不写 localStorage——十一.1「打开即玩、默认组合第一眼印象」，刷新必回 `visible`+默认组合。hidden 态 DOM 可见件仅 ghost=「纯观赏模式」，保留 ghost 是为触屏用户保留可发现回归路径。

### 6.6 切换过渡的实现（六.5，承接 §3.5.3 与 D5/D6）

**时间线总表（D5 定值，常量集中 `core/transition.ts`）**：

| 切换 | 总时长 | 机制 | 原文依据 |
|---|---|---|---|
| 时间 | 1500ms | 光照/天空/雾/语义通道参数插值，无重装配 | 四-5「1~2 秒平滑光照过渡（交叉淡入淡出）」 |
| 天气 | 1500ms | 粒子双集合交叉淡入淡出+材质 uniform 插值+风力指数趋近 | 五-6 |
| 场景 | 600ms | FadeSwap：旧组淡出→分帧构建→新组淡入 | 六.5-①「短暂淡入淡出」 |
| 车型 | 600ms | FadeSwap（作用对象为车型根组） | 六.5-① |
| 离散装饰状态 | 中点切换+200ms 淡入 | blend≥0.5 一次性翻转 | §3.5.3/D5 |

统一缓动 smoothstep `t·t·(3−2t)`；FadeSwap 出/入分别 easeInQuad/easeOutCubic。

**FadeSwap——材质克隆透明度机制（U2）**：因 ToonMaterialFactory 同参数材质全局缓存共享，直接改共享材质会污染新场景/底座/描边壳——**切换时对旧组做一次性材质克隆**：遍历收集 unique material（含反壳材质）逐个 clone、transparent=true、depthWrite 保持 true（防旧场景变「透明壳」穿帮）、共享 uniform 对象**按引用重新挂回**克隆件、旧组全部 castShadow=false（防淡出期投影鬼影）；t=0–300 旧组克隆材质 opacity 1→0；t=150 起分帧构建新场景（≤3 帧）；t=300 旧组移除+句柄反注册+dispose（Material.dispose 不释放共享贴图，安全）；t=300–600 新组淡入 opacity 0→1+scale 0.96→1.0+y +0.35→0（「换展品」落定感），结束还原原生材质恢复 castShadow。克隆成本：单场景 unique 材质约 30–80 个，微秒级一次性。**为什么不是滑动过渡**：平移滑动需新旧两组同场（显存/DC 翻倍）且会滑出底座；交叉淡入+缩落满足原文措辞且允许「淡出旧组」与「分帧构建」重叠。

**时间切换插值**：颜色 lerpColors（线性空间）、方向向量 lerp（夹角 ≥120° 四元数 slerp 兜底）、天空 uniforms、语义通道标量 lerp、离散量 blend≥0.5 单次翻转（per-transition 布尔保证恰好一次）、雾每帧按 D6 公式重算；**可 retarget**——新点击以当前插值中间值为新起点，连续快点四档也是连续渐变。

**天气切换**：粒子双活动集合倍率 `m(t)` 同时作用于发射率与已发射粒子不透明度（雨丝/雪花一起淡去，不出现「半空的雨瞬间消失」）；材质六分量插值写入共享 uniform；夜雨「彩色反光」无需专门过渡（wetness×lampPower 两分量的乘积效应自然叠加）；风力 `cur+=(target−cur)·(1−e^(−3·dt))` 指数趋近（τ≈0.33s）；glowBoost 乘入 halo；cloudShadow 写入 AtmosphereSystem。

**连点与排队策略（U6）**：时间/天气过渡中再点=retarget；场景/车型 FadeSwap 中再点=队列深度 1 后到覆盖；点当前已选中=no-op；过渡进行中的维度行加分段容器 `data-busy` 描边呼吸反馈（按钮不置灰，保持可改主意）。

**相机连续性（六.5-③）**：四类切换**全程不触碰相机**——相机状态唯一属主是 `core/controls.ts`（Engine 持有），TransitionController/Director 无任何 API 能读写它（Director 源码评审含「不得 import controls」）；用户在 600ms FadeSwap 中途继续拖拽完全合法。验收方法：切换瞬间截取连续两帧，相机参数逐位相等。

### 6.7 相机交互与画布自适应（八.5）

**自研轨道相机（U4，~150 行）**：球坐标模型 `{theta, phi, radius, target}` 双份（view/goal）；视锥 fov 40、near 0.1、far 200（★覆盖 20×20 底座+底座内远景，实现期校准）；约束 phi∈[0.35,1.42]rad（≈20° 俯视~81° 贴地平，永不钻到底座下方）、radius∈[5.5,20]（★按 20×20 底座重标定）、theta 无限制、target 固定（无平移——微缩陈列盒构图由固定 target 保证）；默认机位（radius/phi/theta 按「黄昏海崖第一眼印象」取景，★原 12.5/65°/−35° 为 10×10 旧口径，按 20×20 重新标定，模型主体落于画面中上部）。

**鼠标（Pointer Events 统一实现）**：pointerdown→setPointerCapture+活动指针表；单指拖拽=旋转（`goal.theta−=dx·0.0055; goal.phi−=dy·0.0045`，灵敏度小窗自动放缓）；滚轮=乘性缩放 `goal.radius·e^(deltaY·0.0011)` clamp（wheel passive:false+preventDefault）。

**触屏**：单指=旋转；双指=**纯缩放**（`goal.radius·dPrev/dNow`；双指中点位移不映射旋转防误旋）；第三指忽略（指针表容量 2）；`touch-action:none`、contextmenu preventDefault、pointercancel 清空指针表（来电/手势打断不残留）；触控目标 ≥44px。

**阻尼（帧率无关）**：每帧 `k=1−e^(−9·dt)`，view 向 goal 指数趋近——拖拽跟手、松手 ~0.35s 缓停，无过冲无回弹（微缩模型观感要「稳」，不加惯性 fling）；controls.update(dt) 排在帧序 Clock 之后 render 之前。

**画布自适应（八.5 前半）**：`applySize()` 合并到 rAF（一帧最多一次）——`setPixelRatio(min(devicePixelRatio,2))`、`setSize(w,h,false)`（CSS 全权负责）、camera.aspect 更新；ResizeObserver（容器级）+window resize+orientationchange+visualViewport resize（iOS 地址栏伸缩）四路触发。CSS：`html,body{height:100%;overflow:hidden}`、`#app{position:fixed;inset:0}`、`canvas{width:100%;height:100%;touch-action:none}`；极小窗（高 <560px）触发页签折叠。

### 6.8 状态流细化

`AppState`（UI 消费视图）：`get(dim)/snapshot()/set(dim,id)`——set 经 registry.get 校验（未登记抛错并列可用 id）、同值 no-op、成功后 emit；`events.ts` 极简 on/off/emit，事件名 `'state:change'`，载荷 `{dim,id,entry}`。订阅方职责边界：ControlPanel 只更新选中态/标题条/--accent（禁止触发过渡）；TransitionController 只按维度路由四条路径（禁止改 DOM）；hiddenMode 独立于 state。

### 6.9 性能与降级

backdrop-filter 层数 ≤3；UI 动效只动合成器属性；FadeSwap 克隆材质及时 dispose（不影响 SharedAssets 引用计数）；粒子交叉淡入淡出复用池（双集合并存仅 1500ms）；低端降级顺序=先关 postfx→降 DPR→blur 18px 降 8px，**不动过渡时长与场景内容**（氛围完整性优先于 UI 质感）；dev HUD 仅 DEV。

### 6.10 自查表（交付前逐行勾验，结论记 TASKS.md）

①四组按钮图标+文字+三重选中信号；②注册新条目按钮自动出现（DEV 验证后移除）；③组合标题与六.2 示例逐字一致；④六.3 四关键词逐属性核对；⑤默认机位不遮挡；⑥隐藏/呼出三条路径往返；⑦场景/车型 600ms 淡入淡出无黑屏；⑧时间/天气平滑过渡+布料下凹渐变；⑨切换前后相机参数逐位相等；⑩窗口自适应无变形；⑪鼠标拖拽/滚轮 clamp；⑫触屏单指旋转/双指缩放；⑬hidden 态仅 ghost；⑭icons.ts 无人物/无外部资产/无网络请求。

---

## 七、动效清单

> 依据原文七·导言+七-1～七-5，合并 14（动效总清单/统一节奏/风力/粒子/灯点/偶发）与 11（场景动效落点）。组织为「通用 + 逐场景」。总原则：**静止但活着**——全部动效为低频小幅，无高频晃动；偶发型一律走 EventScheduler，禁 setTimeout。

### 7.1 通用系统清单

#### 7.1.1 RhythmClock 统一节奏（七-5，回应「统一节奏」未量化）

| 参数 | 定值 | 用途 |
|---|---|---|
| 呼吸基准周期 T_base | **3.0s** | 灯光呼吸只允许 T_base 的 ÷1（3s）、÷2（1.5s）、×2（6s）三档，全场景灯效同族同步 |
| 闪烁相位分配 | lampIndex × 0.4 rad | 串灯等成组灯交错相位 |
| 阵风函数 gust(t) | 0.3+1.4×(0.5+0.5×simplex1(t/6.5s))+0.3×simplex1(t/17s)，范围 ≈0.3~1.7 | WindSystem 幅度包络；「风事件」叠加其上 |
| 粒子节奏 | 各 EmitterSpec.rate（7.1.3 表），发射相位 jitter ±20% | 防机械感 |
| 偶发事件 | EventScheduler（7.1.5） | 平均间隔±随机窗 |

#### 7.1.2 风力与布料统一系统（七-5：布料统一受风力、风力随天气）

布料网格 PlaneGeometry(12×8 分段)，顶点 shader 位移（固定边→自由边加权、双频 sin、gust 包络）+`uSag` 下凹+`customDepthMaterial` 同步阴影；CPU 每帧只写 4 个共享 uniform。**风力目标值=基准幅×weatherPreset.windMul**（多云 1.3/雨 1.45/雾 0.85/雪 1.1），指数趋近 τ=0.6s。

**布料总注册表**（★含本合并修正：C 型无遮阳棚行已删、挂毯按七-5 补注册）：

| 布料 | 所属 | stiffness | windFactor | sagAmp(m) | 出处 |
|---|---|---|---|---|---|
| 海崖遮阳天幕 | 海崖 | 0.35 | 1.0 | 0.06 | 7-1-②、五-3 |
| 野餐垫纸巾 | 海崖 | 0.85 | 0.8 | 0 | 7-1-⑦（阵风事件） |
| 晾晒毛巾 ×3 | 松林 | 0.5 | 1.0 | 0.02 | 七-5、四-1 露水 |
| 吊床 | 松林 | 0.3 | 1.0 | 0 | 7-2-⑤ |
| 晾衣绳工装 ×3 | 避难所 | 0.45 | 1.0 | 0.02 | 7-3-⑥ |
| 雨棚小旗 | 服务区 | 0.25 | 1.0 | 0 | 7-4-④ |
| A 型遮阳棚/拖挂遮阳棚/B 型遮阳棚/越野遮阳幕 | 车型 | 0.4 | 1.0 | 0.05/0.045/0.05/0.04 | 五-3「天幕与遮阳棚」 |
| C 型/B 型升顶帐帘带（B 型随 ★-B型升顶补建）/B 型纱帘/B 型挂毯（★车内布料） | 车型车内 | 0.9/0.9/0.35/0.6 | **0.12（车内微风）** | 0 | 七-5「挂毯」、3.4 纱帘/掀顶帐帘 |
| 越野帐篷侧布 | 车型 | 0.8 | 1.0 | — | 3.5 |

#### 7.1.3 粒子系统总表（七-5、五-3/5-5、四-2；全场天气+场景粒子 ≤8 draw call）

| kind | 使用处 | rate(/s) | life(s) | 存活峰值 | 尺寸(m) | 运动 |
|---|---|---|---|---|---|---|
| rain 雨 | 五-3 全场景 | 450 | 0.53 | 240 | 0.008×0.14 拉伸 quad | 4.5m/s↓+风×0.3 |
| snow 雪 | 五-5 全场景 | 180 | 4.4 | 800 | 0.02~0.045 | 0.55m/s↓+摆±0.08+风 |
| steam 蒸汽/炊烟 | 烤炉/篝火/发电机/排气口 | 2.2×smokePower+0.4 | 3.5 | ~10 | 0.05→0.25 | 0.22m/s↑+风漂 |
| spark 火星 | 篝火/火堆 | 6×emberPower | 1.4 | ~9 | 0.02→0 | 0.5m/s↑+横向噪声 |
| mist 晨雾 | 松林溪谷 | 1.5（雾天×1.6） | 12 | ~18 | 0.8~1.6 大团 | 0.12m/s 水平漂 |
| dust 微尘 | 避难所光柱 | 6（仅 beam>0.3） | 6 | ~36 | 0.012 | 0.03m/s 随机游走 |
| leaf 落叶 | 松林溪流 | 0.4 | 20 | ~8 | 0.04×0.03 | 顺溪 0.14m/s+旋转 |
| drip 滴水 | 檐口/布檐低点 | 2.5/点 | 0.8 | ~6 | 0.015 拉伸 | 3m/s↓→触地涟漪环 |

#### 7.1.4 灯光呼吸统一系统与灯点注册总表（七-5、四-4；★参数为本合并统一值）

LightBreathSystem 四模式：steady（恒定）/breath{period∈{1.5,3,6}s, depth}（sin 呼吸）/blink{period, duty, stagger}（占空方波+交错相位）/rotate{pattern:'rev'|'sweep'}；所有灯渲染=emissive toon+additive halo sprite；真点光仅 2 个预算位（车内暖光、篝火/火光）。

| 场景/车 | 灯点 | 模式/参数 | 驱动通道 | 原文 |
|---|---|---|---|---|
| 海崖 | 串灯 ×14 | blink 3s depth 0.3 stagger 0.4rad | lampPower | 7-1-①、四-3 |
| 海崖 | 小营地灯 | breath 1.5s depth 0.55（dawn 将熄）→steady | lampPower | 四-1 |
| 海崖 | 灯塔顶灯+光束锥 | steady / **rotate 0.25rad/s（≈25s/圈）**★ | lampPower（dusk 0.4/night 1.0） | 7-1-④、四-3/4 |
| 松林 | 篝火（火焰 shader+点光+halo） | 噪声闪烁 | emberPower | 7-2-⑥ |
| 避难所 | 探照灯光束 | rotate sweep：dawn 6s/55°、dusk 10s/45°、night 14s/40° | lampPower 场景映射 | 7-3-①、四-1/3 |
| 避难所 | 警示红灯 | rotate 0.4rev/s（双叶 additive）+罩体 blink | dusk 0.7/night 1.0 | 7-3-②、四-4 |
| 避难所 | 天线指示灯 | blink 1.2s duty 0.5 | lampPower | 7-3-③、四-4 |
| 避难所 | 净水装置 LED | blink 2.4s 青 `#4AD8E8` | lampPower×0.4 | 2.3.3 冷色荧光 |
| 避难所 | 城市剪影窗灯（Instanced） | steady，抽样点亮 20%/35% | **shopPower×0.6**★ | 2.3-⑬、四-4 |
| 服务区 | 便利店灯箱/橱窗 | steady+循环微闪 breath 6s depth 0.12+偶发双闪 | shopPower | 7-4-② |
| 服务区 | 售货机灯带 | steady，power=max(shopPower, 0.7)（常亮） | shopPower | 7-4-③、四-4 |
| 服务区 | 加油棚灯 ×2 | steady | shopPower×0.8 | 2.4-① |
| 服务区 | 充电桩指示灯 | blink 2.4s 绿 | shopPower | 2.4-④ |
| 服务区 | 高速/出口牌微光 | steady | shopPower×0.3 | 2.4-⑨ |
| 服务区 | 车流光条 | 流动（7.2.4，独立于灯系统） | 时间密度表（B3） | 7-4-① |
| 各车型 | 小夜灯/暖灯带/车内串灯/帐篷 LED | breath 6s depth 0.18 或 blink stagger（4.2 各车钩子） | interiorPower/Emphasis（D2） | 7-1-⑥、四-4 |

#### 7.1.5 偶发动效：EventScheduler 参数（7-1/7-2「偶尔」、Q4 定值；禁 setTimeout）

| # | 事件 | 参数 | 表现实现 |
|---|---|---|---|
| 1 | 海鸟掠过（海崖） | 平均 16s±6s，每次 1~3 只，仅 dawn/day/dusk（**夜间归巢**） | 鸟=缩放椭球身+双翼 plane 铰接；扑翼 3.2Hz±40° 与滑翔交替；贝塞尔路径横越海面上空 h1.6~2.4m 速 1.8m/s；白色 toon noOutline |
| 2 | 松鼠窜过（松林） | 平均 26s±10s，仅 dawn/day/dusk | 体 capsule+头球+尾 3 球上卷；奔跑 8Hz 体颠+尾波；地面样条 2~3m/2.2s，中段可停 0.4s |
| 3 | 纸巾阵风轻掀（海崖） | 平均 11s±4s | 触发时该 ClothHandle 局部 windFactor ×2.2、0.8s 内衰减回 1——纸巾角掀起又落回 |
| 4 | 光斑鸟鸣跳动（松林） | 平均 9s±3s，burst 窗 0.9s | 窗内 3~5 个 ~4Hz 快脉冲（Q1：纯视觉「鸟鸣」节奏） |
| 5 | 招牌双闪（服务区） | 平均 20s±8s | 0.3s 内两短闪（微闪之外点缀） |

#### 7.1.6 动效×时间联动矩阵（各动效何时可见/强度）

| 动效 | dawn | day | dusk | night |
|---|---|---|---|---|
| 串灯/营地灯/灯塔/探照灯/警示灯/天线灯 | 微（0.15）或专属态 | **0（灯具全熄）** | 1.0/启动 | 1.0 主角 |
| 商业灯（灯箱/售货机/棚灯/城市窗） | 0.35 刚开灯 | 1.0 营业 | 0.65 初亮 | 1.0 主角 |
| 车内灯+地面暖光贴花 | 0.2 | 0 | **0.85（冷暖对比核心）** | 1.0 更突出 |
| 篝火/火堆+火星 | 余烬 0.5 | 0（炊烟代替） | 1.0 | 1.0 |
| 炊烟/蒸汽 | 0.25 | **1.0（白天活动细节）** | 0.35 | 0.15 |
| 光斑（松林） | 白金 0.55+跳动 | 0.5 | 金色 0.75 | 0 |
| 晨雾 mist | 1.5/s | 0.4/s | 0.3/s | 0.3/s |
| 露水高光/早餐餐具 | **1/出现** | 0/收起 | 0 | 0 |
| 海鸟/松鼠 | ✓ | ✓ | ✓ | ✗ |
| 车流 | 0.35 | 0.55 | 0.8 渐密 | 1.0 |

### 7.2 逐场景动效清单

#### 7.2.1 海崖 7 项（原文 7-1）

| # | 原文 | 机制归属 | 落地要点与参数 |
|---|---|---|---|
| ① | 串灯轻微闪烁 | 公共 LightBreathSystem | LampHandle blink 3s depth 0.3 stagger 0.4rad（成组交错相位，「轻微」=depth 0.3 不爆闪） |
| ② | 天幕布料随风轻摆 | 公共 WindSystem | ClothHandle stiffness 0.35；风力随天气（windMul），场景零代码 |
| ③ | 海面波光流动 | 场景 SceneAnimation | 2 层波光面 UV 偏移 (0.030,0.012)/(−0.020,0.008) u/s★，整体 α=0.22+0.08·sin(0.7t)；每帧仅写 map.offset 与 opacity；强度随时间（dusk 最盛）与天气（雨×0.9 雾×0.85 雪×0.85） |
| ④ | 灯塔光束缓慢旋转 | 公共 LightBreath+场景 | LampHandle rotate 0.25rad/s（≈25s/圈★）；光束透明度由 applyLighting 按 lampPower 插值（dusk 0.4 起、白天 0） |
| ⑤ | 海鸟偶尔掠过 | 场景+EventScheduler | 7.1.5-1 参数；鸟模型 Capsule+双翼，noOutline |
| ⑥ | 车内小夜灯呼吸明暗 | **车型域（跨域）** | 落点=车型 interiorLightHooks.lamps→LightBreath breath 6s 族（D2）；场景仅由 interiorGlow 获得车外衬光 |
| ⑦ | 野餐垫纸巾被风轻掀 | 公共 WindSystem+EventScheduler 阵风 | ClothHandle stiffness 0.85 + 7.1.5-3 阵风事件（无 gust 事件则靠阵风噪声自然驱动，可接受降级） |

#### 7.2.2 山间松林 7 项（原文 7-2）

| # | 原文 | 机制归属 | 落地要点与参数 |
|---|---|---|---|
| ① | 松针随风轻摆 | 公共 WindSystem（P2 植被通道） | 树冠实例组材质 onBeforeCompile 注入统一摆动：顶摆幅 0.06u、频率 0.8Hz+阵风噪声；实例化松树整批共享同一 uWindAmp 源 |
| ② | 林间光斑摇曳 | 场景 SceneAnimation（光斑系统） | 每片 α=base·(0.85+0.15·sin(0.4t+φᵢ))、位置微移 ±0.03u；uv 漂移 0.008/s；白天 base 0.3、黄昏金 #ffd9a0、夜间 0.06 |
| ③ | 溪水流光与落叶漂流 | 场景 shader+leaf 粒子 | 溪波光 UV 0.05 u/s 沿谷向+太阳镜面带；落叶 leaf 粒子（7.1.3）沿溪漂流自转 0.6rad/s |
| ④ | 松鼠偶尔窜过枝头 | 场景+EventScheduler | 7.1.5-2 参数；模型 Capsule+头球+卷尾，noOutline |
| ⑤ | 吊床轻晃 | 公共 WindSystem | ClothHandle stiffness 0.3（rotation.z 摆 ±2°×gust+布纹波动） |
| ⑥ | 篝火火焰跳动与火星升起 | 场景火焰 shader+spark 粒子 | 三层 cone 火焰（uv 噪声滚动+顶点摆动+scale 脉冲）；spark rate=6×emberPower/s；强度=emberPower（清晨余烬 0.5） |
| ⑦ | 晨雾缓慢流动 | 公共 AtmosphereSystem+mist 粒子+场景雾板（★三层同源） | baseFog 0.32（D6 单通道）；雾板 billboard 横移 ±0.06 u/s、α=雾档基准（清晨 0.5/白天 0.12/黄昏 0.2/夜间 0.3）×fogDensity 归一 |

#### 7.2.3 末日避难所 7 项（原文 7-3）

| # | 原文 | 机制归属 | 落地要点与参数 |
|---|---|---|---|
| ① | 探照灯光束缓慢扫动 | 场景云台编排+LightBreath(亮度) | rotate sweep（B2：dawn 6s/55°→dusk 10s/45°→night 14s/40°）+地面光斑 sprite 沿轨迹同步；光柱 dust 粒子增强体积感 |
| ② | 警示红灯旋转 | 公共 LightBreathSystem | LampHandle rotate 0.4rev/s（红光叶 2 片对置 additive）+halo 脉动；功率=黄昏启动 0.7/夜间 1.0 |
| ③ | 天线指示灯闪烁 | 公共 LightBreathSystem | blink 1.2s duty 0.5，红点+微 halo |
| ④ | 发电机排出蒸汽 | 公共 ParticleSystem | steam 常转 base 1.5/s+smokePower 增密（B6，与四-2 自洽） |
| ⑤ | 火堆火星上升 | 公共 ParticleSystem | spark rate=6×emberPower/s（白天火熄则无火星，B8） |
| ⑥ | 晾衣绳衣物飘动 | 公共 WindSystem | 工装 ×3 ClothHandle（七-5「晾晒衣物」枚举） |
| ⑦ | 微尘在光柱中飘浮 | 公共 ParticleSystem | dust：area=光束路径柱域，rate=beamPower×2/s（仅 beam>0.3），additive α0.35；跟随扫动光柱落点 |

#### 7.2.4 高速路服务区 5 项（原文 7-4）

| # | 原文 | 机制归属 | 落地要点与参数 |
|---|---|---|---|
| ① | 公路主线车流灯光流动 | 场景 SceneAnimation（车流系统） | 双向光条 InstancedMesh（前灯 #FFEFC8/尾灯 #FF5040 拉伸 quad+halo）；车速 2.8m/s；密度 Poisson 间隔 lerp(3.2s,0.55s,density)——B3：dawn 0.35/day 0.55/dusk 0.8/night 1.0；天气修正 rain×0.85/fog×0.9/snow×0.8；光流可见度 dawn 0.45/day 0.3/dusk 0.8/night 1.0；雪地 α×0.7 防过曝 |
| ② | 便利店招牌灯箱循环微闪 | 公共 LightBreathSystem | breath 6s depth 0.12+偶发双闪（7.1.5-5） |
| ③ | 售货机灯带常亮 | 公共 LightBreathSystem | steady+shopPower 下限 0.7（B5，与四-2/D8 自洽） |
| ④ | 雨棚下小旗飘动 | 公共 WindSystem | ClothHandle stiffness 0.25（旗面双面 quad，波动幅度最大；风大全展风小垂搭自然呈现） |
| ⑤ | 行道树叶片轻摆 | 公共 WindSystem（P2 植被通道） | 同松林树冠机制，摆幅 ×0.8（行道树较规整） |

### 7.3 归属裁定小结

26 项场景动效（7+7+7+5）中：**公共系统承载**——布料 5 类（7-1-②⑦、7-2-⑤、7-3-⑥、7-4-④）归 WindSystem、粒子 5 类（蒸汽/火星/微尘/落叶/滴水）归 ParticleSystem、灯效（串灯/营地灯/灯塔/红灯/天线灯/灯箱/灯带/车顶帐篷 LED）归 LightBreathSystem；**场景 SceneAnimation 承载**——海面波光、光斑摇曳、落叶编排、火焰 shader、海鸟、松鼠、探照灯云台、车流光轨；**车型域承载**——车内小夜灯呼吸（7-1-⑥，D2 链）。七-5 的「统一节奏/统一风力」由此在架构上得到保证。

---

## 八、任务拆解与阶段计划

> 依据原文九.1 第⑧项。本文件是**计划态**（全部任务「待开始」）；进入实现阶段后，可勾选的执行态清单建立在项目根 `TASKS.md`（十.2），状态四档（待开始/进行中/已完成/受阻）与复盘结论以 TASKS.md 为唯一事实来源。**前置硬约束**：T01 依赖安装/脚手架以 DESIGN.md 经用户审阅通过为前提（九.1）；依赖变化先行更新 DEPENDENCIES.md（十.3）。

### 8.1 阶段总览（8 阶段 48 任务）

```
P1 脚手架(7) → P2 公共系统(10) → P3 场景×4(5) → P4 车型×5(6) → P5 时间/天气(6) → P6 UI(6) → P7 动效打磨(5) → P8 验收复盘(3)
```

| 阶段 | 目标 | 产出可验收物 | 关键原文依据 |
|---|---|---|---|
| P1 脚手架 | 依赖安装（需审批）+核心基建+渲染冒烟 | 打开即渲染空底座的工程 | 八.1/八.5、九.5 |
| P2 公共系统 | 八.4 六项公共系统+支撑件+Director 编排 | 每套系统可独立挂测试页验证 | 八.4、七-5、四-5、五-3/5-5 |
| P3 场景×4 | 逐场景独立交付（五部分） | 单场景可独立装配验收 | 2.1–2.5、7-1~7-4 |
| P4 车型×5 | 逐车型独立交付（四项） | 单车型任意场景落位验收 | 3.1–3.6 |
| P5 时间/天气 | 四档+五档正式数据与端到端过渡 | 时间/天气全维切换可验收 | 四节、五节 |
| P6 UI | 六.1–六.5 全部+切换端到端 | 完整可巡游控制界面 | 六节、一.4 |
| P7 动效打磨 | 偶发动效、材质级动效、观感与性能调参 | 60fps 实测+观感定稿 | 七节、八.3 |
| P8 验收复盘 | 400 组合核验+逐节最终自查+收尾 | 交付 | 十一、九.3 |

**关键路径**：T01→T05→T06（补丁冒烟，R1 先手）→T08–T17（公共系统）→T18（海崖）→T23（C 型）→T29/T30→T32/T33→T35–T40（UI）→T44→T46–T48。**并行线**：P3 与 P4 只共享公共系统与部件库，可交替并行（交叉点：T24/T25 复用海崖首创 bicycle/benchSlat 等部件）。

### 8.2 阶段 P1 · 脚手架（T01–T07）

> 阶段门禁：T01 依赖安装前置条件=①DESIGN.md 已获用户明确同意（九.1）；②DEPENDENCIES.md 已将依赖表呈报并获批准（十.3）。脚手架完成即本地 git 首笔提交（九.5-b）。

| 任务 | 内容与验收 | 对照 | 依赖 |
|---|---|---|---|
| **T01 工程脚手架与依赖安装** | 建 package.json（scripts/engines/onlyBuiltDependencies）、tsconfig strict、vite.config（base './'+alias）、index.html（内联 favicon）、.gitignore、src 骨架照 §3.2；`pnpm install` 实装 three/vite/typescript/@types/three 并实查版本回写 DEPENDENCIES.md；本地首笔提交（仓库已于文档阶段 2026-11-08 初始化、待用户追认，见 TASKS §6-7）。验收：`pnpm dev` 内置浏览器渲染空白画布无报错；`pnpm build`+`pnpm preview` 可开；typecheck 0 错；`grep -rE "https?://" dist/` 无外链；依赖版本体积已记录 | 八.1、九.5、十.3 | 用户审批 |
| **T02 Engine 与渲染循环** | engine.ts：renderer（SRGB、NoToneMapping、DPR≤2）、scene/camera、固定帧序（Clock→Transition→公共系统→场景动画→render）、ResizeObserver、dev DC/材质计数器（仅 DEV）。验收：窗口拉伸自适应；计数器不进产物 | 八.5、一.4 | T01 |
| **T03 轨道相机（自研）** | controls.ts 球坐标+指数阻尼+Pointer Events（拖拽/滚轮乘性/双指纯缩放）+边界夹取+touch-action:none；默认机位按 20×20 底座标定。验收：拖拽跟手缓停、缩放 clamp、phi 不钻底座下方；reset 仅初始化 | 一.1、八.5、六.5-③ | T02 |
| **T04 注册表与状态基建** | registry.ts（register 重复抛错/get 未登记抛错/list 保序）、state.ts（get/snapshot/set 同值 no-op）、events.ts、四套 content/*/types.ts（含 §3.9 增补字段 M1–M4）。验收：接口类型编译通过并作为一切内容模块契约；异常行为有验证 | 2.5.3、3.6、八.4 | T01 |
| **T05 程序化资产基建** | SharedAssets（引用计数）、tex/canvasTex（缓存+preloadAll）、geom/primitives（roundedBox/profileExtrude/Lathe/Tube）、geom/instanced（InstancedGroup 含 withShell）、ToonMaterialFactory（12 原型+ramp 5 档+玻璃变体+共享 uniform 挂点）。验收：同 id 命中缓存、release 归零 dispose、同类 ≥3 必实例化、ramp 为 Canvas 生成 | 八.2、八.3 | T01 |
| **T06 onBeforeCompile 补丁冒烟（R1 先手）** | RGB ramp/高光带/rim 三补丁+customProgramCacheKey+逐补丁可关+失败自动降级；冒烟用例（色带+高光+rim 同屏）在实装 three 版本验证。验收：三补丁同屏正确、逐关不报错、全关画面成立 | 八.2 | T05 |
| **T07 统一底座 BaseAssembler** | 20×20u 正方形底座统一骨架（45° 倒角台缘+剖面阶梯+托板）+BaseStyleSpec 消费（J1 五字段）。验收：注入任一 baseStyle 仅换材质/边缘/层数，形式全场景一致；剪影板挂点就位 | 一.3、D1 | T05 |

### 8.3 阶段 P2 · 公共系统（T08–T17）

> 每套系统「可独立验收」：dev 测试页单独挂载演示，验收后再进 Director 编排（T17）。

| 任务 | 内容与验收 | 对照 | 依赖 |
|---|---|---|---|
| **T08 RhythmClock** | T_base=3s 三档分频、闪烁相位 lampIndex×0.4rad、阵风 gust(t)、粒子 jitter ±20%、elapsed 统一发源。验收：三档同源；阵风连续；全部系统禁自起 setTimeout（review 红线） | 七-5 | T01 |
| **T09 WindSystem+ClothHandle** | 布料顶点 shader（固定边加权/双频 sin/gust 包络）+uSag（M1 字段）+customDepthMaterial 同步阴影+风力指数趋近+植被摆动 uniform 通道（P2）。验收：多 stiffness 布料统一受风；windMul 无级变化；阴影与摆动一致；车内布料 0.12 微动 | 七-5、五-2/5-3、四-2 | T05、T08 |
| **T10 ParticleSystem+EmitterSpec** | GPU 发射器池+8 种 kind 参数表（7.1.3）+setRate() 实例句柄（P1）+天气双集合交叉淡化+滴水涟漪环。验收：各 kind 按表运行；粒子 ≤8 DC；过渡期峰值在预算内；rate 可被通道逐帧调制 | 八.4、五-3/5-5、四-2 | T05、T08 |
| **T11 LightBreathSystem+LampHandle** | 四模式（M2 pattern/floor）+halo sprite 管线（glowBoost 缩放）+功率通道叠加。验收：串灯 blink 交错/夜灯 breath/红灯 rotate/探照灯 sweep 可演示；op<0.02 自动隐藏；halo 随 glowBoost 放大 | 八.4、7-1-①⑥、四-4、五-4 | T05、T08 |
| **T12 TimeLightSystem+SceneLightState** | GlobalLightParams 应用器+六通道下发+SceneLightState 构建（含 interiorGlow、fogDensity）+颜色线性空间转换。验收：占位预设应用后 rig/天空/雾正确；通道可达钩子 | 四-5、四·总则 | T02、T04 |
| **T13 WeatherMaterialSystem+WeatherSurface** | 7 分量共享 uniform 单例+按引用注入+uSnow 法线遮罩+uLineFade+uCloudShadow 云影 quad+镜面反光条（castReflection）+雪壳挂点（M4）；kind 四分支。验收：改 7 个数字全场生效；五档插值平滑；uSnow 覆盖五-5 枚举全部朝上部位 | 八.4、五-2/5-3/5-5、五-6 | T05、T09 |
| **T14 AtmosphereSystem** | D6 单通道 fog01→FogExp2 映射+剪影板逐层雾化 layerFade+天空向雾色压缩+云影/云带驱动。验收：清晨浓雾松林封顶不发糊；夜间浓雾光晕最强组合复核；远景逐层退隐 | 五-4、五-6、D6 | T12、T13 |
| **T15 EventScheduler** | 平均间隔+随机窗+最短间隔排程器（禁 setTimeout）；五个预置事件参数（7.1.5）。验收：节奏符合参数表；夜间自动静默（海鸟/松鼠归巢） | 7-1-⑤⑦、7-2-④、Q4 | T08 |
| **T16 OutlineSystem** | 反壳（BackSide+法线膨胀，renderOrder=1）+noOutline 开关+实例化成对壳+宽度档位表+描边色三选一+后期描边接口保留不实现。验收：硬边低模不裂缝；noOutline 零成本；实例化组恒 2 DC；近粗远细 | 八.2、一.2、八.4 | T05 |
| **T17 Director+TransitionController** | 装配/卸载编排（BaseAssembler→buildTerrain→buildProps→句柄注册→createAnimations→预设应用；卸载反注册+assets 释放+dispose）、campAnchor 对位、四维切换路径（时间 1500ms 插值+retarget；天气 1500ms；场景/车型 600ms FadeSwap 材质克隆+分帧 ≤3 帧；离散量中点切换+0.2s 淡入）。验收：默认组合首帧直接呈现不播过渡；连点 retarget 无跳变；场景切换相机不动；切换 20 轮 DC/内存稳定（泄漏测试） | 六.5、四-5、五-6、D5 | T02/T03/T04/T12/T13 |

### 8.4 阶段 P3 · 场景×4（T18–T22）

> 每个场景=SceneModule 五部分完整实现+独立验收。海崖先行（默认场景+部件库首发）。验收一律含：元素清单逐组勾验、动效清单逐项勾验、四档时间表现矩阵、四天气作用面、DC ≤200、无人物红线自查。

| 任务 | 内容与验收 | 对照 | 依赖 |
|---|---|---|---|
| **T18 海崖 seacliff（默认场景）** | 地形（崖体/海面/海湾/石阶槽）+15 组元素（4.1.1）+7 项动效（7.2.1）+palette 12 通道+光照钩子行为表+天气作用面；部件库首发（waterSurface/rockCluster/benchSlat/foldTable/foldChair/clothMicro/signBoard/gardenHose/bicycle/campfire 变体）。验收：2.1.2-①..⑮ 逐组在场；7-1-①..⑦ 逐项可演示（⑥ 落车型域）；黄昏冷暖对比；帆船四档位置表；清晨餐具/露水；DC ≈115；无人物 | 2.1.1–2.5.4、7-1、四-1/3/4 海崖专属 | T07、T08–T17 |
| **T19 松林 pineforest** | 碎石台体/溪谷/溪流/38 棵 3 档实例化松树/山脊剪影/云带+12 组元素+7 项动效+palette baseFog 0.32+光照钩子（鸟鸣光斑/逆光剪影/露水毛巾）。验收：2.2.2-①..⑫ 逐组在场；7-2-①..⑦ 逐项可演示；清晨流动晨雾与光斑跳动；黄昏金色光斑+逆光剪影；浓雾逐层雾化；DC ≈135 | 2.2.1–2.5.4、7-2、D6 | T18、T08–T17 |
| **T20 避难所 wasteland** | 硬化地面/半包围工事带/高架桥+城市剪影+13 组元素+7 项动效+治愈系配色纪律+光照钩子（J5 时序）。验收：2.3.2-①..⑬ 逐组在场；7-3-①..⑦ 逐项可演示；残骸无乘员/警示牌无骷髅（一.5/一.6）；锈红沙黄低饱和；夜间冷色荧光；DC ≈150 | 2.3.1–2.5.4、7-3、一.5 | T18、T08–T17 |
| **T21 服务区 servicearea** | 柏油停车区/划线车位/公路主线+12 组元素+送货小车+5 项动效+shopPower 全落点（D8）+光照钩子（车流密度 B3）。验收：2.4.2-①..⑫ 逐组在场（货道=真实小几何 J3）；7-4-①..⑤ 逐项可演示；夜间灯箱/灯带/车流主角感；降雪划线若隐若现；DC ≈150 | 2.4.1–2.5.4、7-4、五-5 特例、D8 | T18、T08–T17 |
| **T22 场景注册表合拢+扩展演练** | 四场景全部 register；临时测试场景 lakeside（最小 SceneModule）注册→UI 自动出现→卸除，验证「新增场景零核心改动」（git diff 为证）；campAnchor 表终稿回写。验收：演练后移除测试场景（git 管理+待清理项记录，九.4） | 2.5.1–2.5.4、八.4 | T18–T21、T04 |

### 8.5 阶段 P4 · 车型×5（T23–T28）

> 每个车型=VehicleModule 四项完整实现+可在任意场景落位验收。C 型先行（默认车型+vehicleKit+透视内饰三件套首落地）。

| 任务 | 内容与验收 | 对照 | 依赖 |
|---|---|---|---|
| **T23 vehicleKit+C型 classC（默认车型）** | vehicleKit 首批工厂（wheel/pleatedBand/rollBundle/gaugeCluster/screenPanel/booksStack 等）；C 型外部（凸头/升顶/滑出/侧窗真开洞）+2 个 DeploymentPart+透视内饰三件套（innerShell/玻璃三档/内饰 noOutline）+16 个 named+小夜灯 breath+顶灯+roofTop 挂点。验收：3.1-1…13 逐条在场；透窗与升顶帐帘「清楚看到」（三·总则-3）；黄昏车内暖光对比（3.1-13）；细节量基准 16 named/22 外部行；footprint 越界告警生效 | 3.1、三·总则、3.6-2、7-1-⑥ | T07、T09、T11、T13、T16、T17 |
| **T24 A型 classA** | 大巴车身/贯通侧窗/车顶外机+卫星锅/侧裙舱门/遮阳棚+踏步/车尾自行车架；环形沙发/中岛/卫浴舱等 17 named；灯带+阅读灯+卫浴冷光。验收：3.2-1…13 逐条在场；named 17≥16、外部 24≥22；暖木豪华感与 C 型对比明显 | 3.2、三·总则-4/5 | T23、T18 |
| **T25 拖挂房车 trailerRig** | D4 单模块双主体固定摆位；皮卡（货斗三件/牵引杆）；流线拖挂（分瓣开窗/支撑腿/遮阳棚/气瓶备胎）；拖挂 10 named+皮卡 6 named；拖挂顶灯+皮卡屏微光。验收：3.3-1…12 逐条在场；组合居中对位、footprint 越界告警（★按半径仲裁回调后复核）；「车队式」一冷一暖；named 16≥16、外部 25≥22 | 3.3、D4、三·总则-5 | T23、T18 |
| **T26 B型 classB** | 双色车身/行李架+冲浪板/侧棚/后掀尾门+纱帘/手绘贴纸；补建升顶（★待用户确认项）；对坐卡座/半展开变床/迷你厨房/串灯错相/咖啡具等 16 named。验收：3.4-1…12 逐条在场；「可变床结构半展开」一车同现；纱帘网格柔化透光；named 16≥16、外部 23≥22 | 3.4、三·总则-4/5 | T23 |
| **T27 越野皮卡 overlandTruck** | 升高底盘/全地形胎/RTT 双壳上翻外伸/登车梯/遮阳幕/货斗四件/爬梯/探照灯；床台/地图/对讲机道具/网兜等 16 named；帐篷 LED 串 blink+屏幕冷光。验收：3.5-1…9 逐条在场；双壳机构与 C 型差异明显；对讲机为摆放道具（Q5，无人物）；named 16≥16、外部 24≥22 | 3.5、三·总则-4/5、Q5 | T23 |
| **T28 vehicleRegistry 合拢+差异与细节量核对+扩展演练** | 五车全部 register；差异矩阵终检（§4.2.6 五维两两不同）；细节量双指标核对表回填；临时测试车型注册/卸除演练（git diff 为证）；camp.radius 契约复核仲裁（★按场景章数值回调车型）。验收：五车×四场景 20 种落位全部完成且姿态正常（A型/拖挂组合在 4.0 半径营位按一.12 ★-半径属既定非阻断告警，不计失败）；新增车型零核心改动；核对表全 ✓ | 3.6-1…4、三·总则-4/5/6 | T23–T27、T18–T21 |

### 8.6 阶段 P5 · 时间/天气（T29–T34）

| 任务 | 内容与验收 | 对照 | 依赖 |
|---|---|---|---|
| **T29 timeRegistry 四档正式预设** | dawn/day/dusk/night 的 GlobalLightParams 定值（4.3.2 表）+六语义通道（4.3.2 表）+transitionMs=1500。验收：四档光照数值与表一致；清晨长投影与夜间星空就绪；dusk 为 isDefault | 四-1…四-4、四-5 | T04、T12 |
| **T30 weatherRegistry 五档正式预设** | 五档 lightMod+particles+material 七分量+windMul 定值（4.4.1 表）；晴朗=全中性。验收：五档数值与表一致；clear 直通时间预设；windMul 映射生效 | 五-1…五-5 | T04、T13 |
| **T31 通用装饰物状态 8 项端到端** | 将熄未熄/篝火余烬/早餐餐具（四场景就餐面 B1）/露水高光/灯具全熄+投影清晰/炊烟蒸汽/黄昏点灯/夜间星空月面+8 枚举灯全亮。验收：8 项逐项四场景可演示；离散量中点切换+0.2s 淡入；四档差异最低集合自检四项齐备 | 四-1/2/3/4 | T18–T21、T29、T30、T10 |
| **T32 时间切换端到端验收** | 四场景×四档全矩阵：光照/天空/阴影/装饰物四联动核验（不允许只换色调）、1500ms 过渡、retarget、离散量切换。验收：16 组合逐格勾验（各场景行为表）；过渡无跳变；相机不动 | 四·总则、四-5、六.5-② | T29、T17、T18–T21 |
| **T33 天气切换端到端验收** | 四场景×五档全矩阵：粒子交叉淡化、材质七分量插值、风力趋近、雨滴/积雪/雾/云影逐项核验。验收：20 组合逐格勾验；雨↔雪↔无 1.5s 无跳变；夜间湿地彩色反光可见 | 五·总则、五-2…五-6、六.5-② | T30、T13、T10、T09、T18–T21 |
| **T34 时间×天气综合光照合成核验** | 先时间后天气合成公式（4.4.4）+20 组合速查矩阵抽验+三个原文示例组合专项复核（夜间浓雾避难所/清晨浓雾松林/黄昏降雪海崖）。验收：三示例逐项达标（更暗+更强光晕；雾封顶不叠糊；雪不改天空色调） | 五-6 后半、D6 | T29、T30、T12、T13、T14 |

### 8.7 阶段 P6 · UI（T35–T40）

| 任务 | 内容与验收 | 对照 | 依赖 |
|---|---|---|---|
| **T35 ControlPanel 四组分段按钮** | registry.list() 驱动+label 透传+icons.ts 21 枚内联 SVG（程序化循环生成 D7）+aria-pressed 三重选中信号+同值 no-op。验收：按钮顺序=注册顺序；图标无人物/无外部资产；注册新条目按钮自动出现；键盘可达 | 六.1、D7、2.5.3/3.6-3 | T04、T22、T28 |
| **T36 组合标题条** | 左上玻璃 chip，`join(' · ')`，双 span 交替动画，省略兜底。验收：与六.2 示例逐字一致；label 改名自动跟随 | 六.2 | T35 |
| **T37 磨砂玻璃视觉系统** | 玻璃基线（blur 18px/saturate 1.45/细描边/圆角/柔和阴影/内高光）+深色基线+@supports 降级+--accent 四值联动+hover/选中微动效+prefers-reduced-motion。验收：六.3 四关键词逐属性核对；backdrop-filter ≤3；动画只动 transform/opacity；对比 ≥4.5:1 | 六.3、U3 | T35 |
| **T38 隐藏/呼出 UI** | 状态机（260ms hiding/ghost 把手+呼吸提示一次）+H 键+触屏命中区 44px+不持久化。验收：三条往返路径全通；hidden 态 DOM 仅 ghost；刷新回默认组合（十一.1） | 六.4、一.4、十一.1、U5 | T35 |
| **T39 响应式与不遮挡校准** | <720px 页签条折叠+safe-area 让位+默认机位与面板遮挡实测校准（★20×20 底座下重标 fov/target/radius）+极小窗保护。验收：折叠/展开正常；默认机位底座主体完整可见（截图核对）；窄屏无遮挡死区 | 六.3、八.5 | T37、T03 |
| **T40 切换过渡 UI 端到端联调** | 点击→AppState→EventBus→TransitionController 全链路；FadeSwap 联调（含共享 uniform 克隆重挂验证——风险点）；连点排队策略；data-busy 反馈。验收：六.5 三条逐项录屏核对；选中项重复点击 no-op | 六.5 | T17、T35 |

### 8.8 阶段 P7 · 动效打磨（T41–T45）

| 任务 | 内容与验收 | 对照 | 依赖 |
|---|---|---|---|
| **T41 偶发动效实机调参** | 海鸟/松鼠/纸巾轻掀/光斑鸟鸣/招牌双闪按 7.1.5 参数表实机调整。验收：五事件各连续观察 3 分钟节奏自然；「静止但活着」总原则（无高频晃动） | 七·导言、7-1-⑤⑦、7-2-④ | T15、T18–T21、T32 |
| **T42 材质级动效统一调优** | 海面/溪流波光、光斑摇曳、车流光轨、光束锥、湿地反光条、雪面闪点按 5.8 映射表调优。验收：7-1-③/7-2-③/7-4-① 逐项观感达标；雨夜反光条可见不过曝；雪地光轨 α 修正生效 | 7-1-③、7-2-③、7-4-①、五-3 | T18–T21、T33 |
| **T43 三渲二观感整体调参** | ramp 档位/描边宽度与色/光照色值/雾密度/饱和度纪律/明度秩序全局过一遍；对「日式二次元动画场景模型」总观感逐场景定稿。验收：一.2 六个关键词逐词自查；无死黑阴影（暗带 ≥0.34）；末世干净治愈 | 一.2、一.3、一.5 | T18–T28、T32、T34 |
| **T44 性能实测与预算回填** | 5.7 验收测量矩阵执行（内置浏览器+FPS 计+最重三组合+1080p）；DC/材质/三角形实测回填 4.2/5.6 预算表；降级阶梯 L0–L3 触发验证；超预算分项逐项回收。验收：稳定 ≥55fps（1% low ≥40）达成；DC ≤200/材质 ≤28 实测达标记 TASKS.md；降级只降不升全程静默 | 八.3、九.2 | T18–T28、T02 |
| **T45 默认组合第一眼印象定稿** | 「海崖·C型房车·黄昏·晴朗」专项打磨：默认机位取景、第一屏构图、加载到首帧时长优化。验收：打开即玩第一眼达「原始设计经典一幕」标准（截图对比）；刷新必回默认组合 | 十一.1 | T43、T18、T23、T32 |

### 8.9 阶段 P8 · 验收复盘（T46–T48）

| 任务 | 内容与验收 | 对照 | 依赖 |
|---|---|---|---|
| **T46 400 组合巡游核验** | 4×5×4×5 全组合巡游脚本化过一遍（截图抽查+逐格清单）；每次切换灯光/装饰/氛围真实变化核验；车型跨场景轻微适配复核。验收：400 组合无报错无穿帮抽查记录；核心观感全组合成立 | 十一.2/11.3、三·总则-2/6 | T18–T34、T40 |
| **T47 对照原文逐节最终自查** | 按九.3 与十一.4，对照原文一~十一节逐节核对（附本文档对照表逐行勾验）；结论写入 TASKS.md「阶段性复盘记录」区。验收：逐节自查表全 ✓ 或带遗留项说明；**断网运行验证**通过 | 九.3、十一.4、十.2 | T46 |
| **T48 收尾与文档回写** | DESIGN.md/TASKS.md/DEPENDENCIES.md 终版回写（十.0）；git 提交颗粒度整理（九.5-b）；「待清理项」清单（如有，九.4-b/d：node_modules 隔离项、临时测试文件等，绝不直接删除）；交付说明。验收：三文档与代码一致；git log 清晰；无任何远程仓库痕迹（九.5-c） | 九.4、九.5、十.0–十.3 | T47 |

### 8.10 依赖关系与里程碑

```
T01 ─┬─ T02 ─ T03 ─┐
     ├─ T04 ───────┼───────────────────────────────（types 契约供全部内容任务）
     └─ T05 ─┬─ T06（补丁冒烟，独立先行）
             ├─ T07 ───────────────┐
             ├─ T08 ─┬─ T09 ─┐     │
             │       ├─ T10 ─┤     │
             │       ├─ T11 ─┤     │
             │       └─ T15 ─┤     │
             ├─ T12 ─┬─ T14 ─┤     │
             ├─ T13 ─┴─ T16 ─┤     │
             └────────────── T17 ◄─┘

T17+T07+T08..T16 ─► T18（海崖）─► T19/T20/T21（可并行）─► T22
T07+T09/T11/T13/T16+T17 ─► T23（C型+vehicleKit）─► T24/T25/T26/T27（可并行；T24/T25 另依赖 T18）─► T28
T04+T12 ─► T29；T04+T13 ─► T30；T29+T30+T18..T21 ─► T31 ─► T32 ─► T34；T33（天气端到端）
T17+T22+T28 ─► T35 ─► T36/T37/T38 ─► T39；T17+T35 ─► T40
T15+T32 ─► T41；T33 ─► T42；T43 ◄─ T32+T34；T44 ◄─ 全内容；T45 ◄─ T43
全部 ─► T46 ─► T47 ─► T48
```

- **并行建议**：P3（T18 串行、T19–T21 并行）与 P4（T23 后 T24–T27 并行）两线交替；T29/T30 数据任务可与 P3/P4 后期并行。
- **里程碑（各成一笔本地 git 提交，九.5-b）**：M1=T17（编排可跑，最小桩场景）；M2=T18+T23（默认组合真实内容首次合体）；M3=T33/T34（时间天气全维生效）；M4=T40（UI 完整可巡游）；M5=T44（性能达标）；M6=T47（最终自查通过）。

### 8.11 任务与原文小节覆盖对照（防遗漏索引）

| 原文章节 | 覆盖任务 |
|---|---|
| 一（总纲 1–6） | T03/T07（一.1/一.3）、T43（一.2/一.5）、T20（一.5 末世）、T18–T21+T44（一.6 无人物）、T38（一.4） |
| 二（场景 2.1–2.5） | T18/T19/T20/T21/T22 |
| 三（车型 3.1–3.6） | T23/T24/T25/T26/T27/T28 |
| 四（时间） | T12/T29/T31/T32/T34 |
| 五（天气） | T13/T14/T30/T31/T33/T34 |
| 六（UI） | T35/T36/T37/T38/T39/T40 |
| 七（动效 7-1~7-5） | T08–T11、T15、T18–T21（场景动效）、T41/T42 |
| 八（技术 8.1–8.5） | T01/T16（8.1/8.2）、T05/T44（8.3）、T04/T08–T16（8.4）、T02/T03/T39（8.5） |
| 九（流程） | T01（九.1/九.5）、全程内置浏览器（九.2）、T47（九.3）、T48（九.4）、T01/T48（九.5） |
| 十（过程文档） | T01/T48（三文档维护纪律） |
| 十一（验收） | T45/T46/T47 |

---

## 九、风险与取舍说明

> 依据原文八.3（60fps）、一.2（观感）、八.2（纯程序化）、十一（400 组合）、九.x（流程红线）。各分章就地处理的细项以本文件为全局索引；实现期发现新风险按十.1 回写本文件。体例：描述→影响→缓解→残余，按高/中/低分级。

### 9.1 性能风险（60fps，八.3）

- **R1｜onBeforeCompile 补丁与 three 版本耦合【高】**：RGB ramp/高光带/rim 三补丁、布料位移、天气 uniform 注入全部依赖替换 three 内建着色器字符串；升级可能静默失效。影响三渲二风格核心。缓解：①锁版本 ≥0.160+lockfile 提交；②T06 冒烟先行于一切内容开发；③每补丁独立可关，全关退化为纯内建 MeshToonMaterial+灰度 ramp+冷暖灯光，画面依然成立；④不随手升级，升级=重跑冒烟+回写 DEPENDENCIES.md。残余：以锁定版本消除。
- **R2｜Draw Call/材质数超预算【中】**：≤200 DC、≤28 材质为设计预算未实测，最重组合（拖挂+场景+夜+雨+halo+粒子）可能破线。缓解：①dev 计数器从第一个部件起常显，超预算部件在 geom/parts 层当场合并；②描边分级关闭；③同类 ≥3 必实例化+withShell 成对；④T44 实测回填，破线按降级阶梯回收。残余：最重组合接受 pixelRatio 降档（观感轻微变软，功能无损）。
- **R3｜halo/贴花 overdraw【中】**：串灯 14 泡+夜/雾 halo 放大+反光条+云影+车流光条叠加，加性 overdraw 可能成集显瓶颈——夜间/浓雾恰是氛围主力档。缓解：halo ≤64²、屏占比 ≤15%、op<0.02 自动隐藏、L3 远距剔除、bloom 仅夜/雾可关；T44 专项测夜间浓雾。残余：夜间组合集显上比白天慢属预期，以 ≥55fps 达标线衡量。
- **R4｜阴影静态化边界【低】**：autoUpdate=false 稳态零重绘，但过渡/装配/布料剧变需置脏，漏置脏出「鬼影」。缓解：置脏时机收敛为三处封装为引擎 API；T32/T40 端到端含影子核对。残余：布料微摆阴影不跟随，为已接受取舍（微缩观感不可察觉）。

### 9.2 三渲二观感达成度风险（一.2）

- **R5｜观感「不到三渲二」【高·主观】**：卡通材质+色阶+描边+冷暖分工+材质干净任何一环弱化即掉档；审美达标主观，参数表全为纸面初值。缓解：①机制锁死分工（暗部色相由 hemisphere 决定、ramp 只量化直射光、无死黑底线）；②反壳近粗远细保「模型勾线感」；③T45 以默认组合为观感锚点先定调再横向推广；④T43 全局调参轮+T46 巡游逐格抽查；⑤全部参数表在 TASKS.md 留「可整体微调」条目。残余：观感上限依赖迭代轮数（已排 T43/T45 两轮）。
- **R6｜反壳硬边裂缝与崖体破面【中】**：反壳在低模硬边处裂缝/过细；崖体 Extrude 侧壁倒角处易破面。缓解：部件库法线规范（硬边拆分/曲面共享）+宽度上限 0.06；崖体等特例用顶缘 Tube 描边替代；部件逐个目检进 TASKS（T16/T18）；OutlineSystem 保留 post 模式接口仅备不启。残余：个别异形件逐个手调。
- **R7｜描边壳与透明体排序穿帮【低】**：renderOrder 分层依赖严格遵守；城市剪影/雾板/灯箱可能错帧。缓解：渲染顺序在工厂与 BaseAssembler 统一设置而非内容模块自定；T46 含「夜+雾」排序专项抽查。残余：个别叠加场景实现期微调。

### 9.3 纯程序化建模表现力上限（八.2）

- **R8｜无 DCC 下复杂形体精度上限【中】**：严禁 Blender，全靠基本体/Lathe/Extrude/Tube/实例化；流线拖挂「罐头火腿」分瓣壳、凸头、帆船、灯塔等形体有天花板；「高精细建模」与 ≤250k tri 双重约束。缓解：①四大手法库+20 个 vehicleKit 工厂把复杂度摊到参数化部件；②分段数工厂写死；③「高精细」以细节密度实现（named 清单/道具组清单），正对「细节量不得少于 C 型」验收口径；④名牌件（凸头/拖挂壳）在 T23/T25 预留额外打磨。残余：曲面形体最终观感依赖迭代，可用贴图/描边补强轮廓。
- **R9｜程序化贴图文字/手写风格漂移【低】**：系统字体栈 fillText+逐字符抖动模拟手写，不同机器字体回退不同。缓解：字体栈顺序固定；文案集中 `tex/signageTexts.ts` 常量表（J6 已拍板）；贴纸主题限定非人物元素。残余：接受轻微风格漂移（原文未指定字体）。

### 9.4 工作量与优先级取舍

- **R10｜内容体量大【高】**：52 组场景元素+81 个内饰 named+26 项动效+10 套系统，48 任务；P3+P4 是工作量主体。缓解：①关键路径竖切优先——T18+T23 最早合体（M2），任何时刻都有「能玩的版本」；②部件库复用率最大化（写一次五处引用）；③优先级降序预案（若工期告急按此砍，**砍前回写文档并经用户同意**）：1 默认组合全保真（不可降级）→ 2 时间/天气全维（不可降级）→ 3 其余 3 场景 4 车型保数量守细节量底线（16 named/22 行双指标下限）→ 4 P7 打磨项压缩轮数 → 5 postfx/bloom 与可选增强最先关。残余：降级预案 3–5 档牺牲打磨轮数，需用户出现工期信号时拍板，不擅自砍。
- **R11｜「注册表可扩展」被验证成本侵蚀【低】**：2.5.4/3.6-3 要求「新增不改核心」，若实现中留下隐性反向依赖，演练失败返工面大。缓解：依赖纪律从 T01 起作 review 清单项；T22/T28 演练用 git diff 作证；import 检查可一行 grep 脚本辅助。残余：无（纪律问题）。

### 9.5 组合状态一致性风险（十一.2，400 组合）

- **R12｜雾/光照双重叠加与合成规则暗角【中】**：五-6 只给一例，其余组合靠公式合成；场景固有雾与天气雾分别实现会双重叠加发糊。缓解：①D6 单通道唯一出口（AtmosphereSystem），场景雾与天气雾是同一个数；②20 组合速查矩阵+clamp 封顶+三原文示例专项复核（T34）；③T46 全组合巡游兜底。残余：个别极端组合（清晨浓雾松林 fog01 封顶）观感需实机标定。
- **R13｜句柄泄漏与状态残留【中】**：场景切换须反注册四类句柄+dispose 动画+释放 assets，漏一项则旧场景灯还在闪/布还在飘；FadeSwap 材质克隆需把共享 uniform 按引用重挂。缓解：①注册/反注册做成 Director 内成对 API（装配时自动记录清单，卸载反向执行）；②T17 验收含「切换 20 轮 DC/内存稳定」泄漏测试；③共享 uniform 按引用注入是 ToonMaterialFactory 强制约定，T40 专项验证；④极端兜底：FadeSwap 快照 uniform 值写入克隆件（600ms 内天气参数冻结，影响极小）。残余：无已知无法兜底的路径。
- **R14｜过渡中途连点与离散量重复切换【低】**：缓解：retarget 快照机制+per-transition 布尔；T40/T46 连点专项测试。残余：无。
- **R15｜车型×场景的物理适配冲突【低→已仲裁】**：车型章按 radius≥5.5 设计 vs 场景章 4.0–4.2（★本合并已按场景章仲裁并回调车型尺寸，见一.12）；拖挂组合、A型（回调后 ≈4.18 仍大于海崖/松林/避难所 4.0 半径）与越野帐篷外伸仍可能触告警。缓解：T28 合拢复核仲裁结果；越界只告警不阻断；T46 全落位核验兜底。残余：拖挂组合与 A型在部分场景视觉偏大——属可接受的「微缩玩具」夸张。

### 9.6 数据与实现一致性风险

- **R16｜分章接口漂移（M1–M4/P1–P4 等未回写）【中→已汇定】**：本合并已将 M1–M4/P1–P4/车型章遗留汇成一张「接口增补决议表」（§3.9）随文交付用户确认；T04 的 types.ts 以决议表为准一次性落定；此后任何接口变更走十.1 回写流程。残余：无（流程问题）。
- **R17｜参数表「纸面定值」与实机观感偏差【低·预期内】**：全部数值（光照预设/动效频率/雾映射/粒子 rate）未经运行验证。缓解：数值全部集中成表可整体调整；TASKS.md 复盘区按「参数轮」记录微调——这是计划内迭代而非返工风险。残余：接受。

### 9.7 流程与安全红线风险（九.4/九.5/十.3）

- **R18｜依赖审批门禁被绕过【中·流程】**：九.1 要求审阅通过前不装依赖；呈报清单与实际安装不符即违规。缓解：①T01 安装前置条件写死（DESIGN.md 批准+DEPENDENCIES.md 批准）；②每次依赖变化先改 DEPENDENCIES.md 再动 package.json；③T48 核对两者一致性。残余：无。
- **R19｜清理操作踩红线【中·流程】**：项目周期内会出现 node_modules 重装、临时测试文件清理（T22/T28 演练模块）——通配符/递归删除被绝对禁止，回收站在部分脚本环境不可靠。缓解：①node_modules 问题一律 `pnpm install --force` 或整体重命名 `node_modules_broken` 挪开（九.4-b）；②确需删文件：逐一显式绝对路径+移入回收站；环境不可靠则保留并记「待清理项」（九.4-c/d）；③演练用测试模块移除用 git 管理+回收站双保险；④T48 交付说明含待清理项清单。残余：回收站行为因环境而异，宁可留文件不冒险（原则：宁可换方法，不做大规模删除）。
- **R20｜内置浏览器约束下的调试效率【低】**：全程禁系统浏览器，性能分析依赖内置预览调试能力。缓解：dev FPS 计+1% low 自建面板；渲染截图/控制台调试全走内置工具；T44 方法论已按内置浏览器写定。残余：若内置工具能力不足，性能数据以 FPS 计数值为准。
- **R21｜本地 git 提交颗粒度失衡【低】**：过粗丢回滚点、过碎污染历史。缓解：按 6 个里程碑+单场景/单车型/单系统完成即提交（原文点名颗粒度）；提交信息模板写进 T01。残余：无。

### 9.8 取舍决定汇总（明示接受的取舍）

| # | 取舍 | 换来什么 | 依据 |
|---|---|---|---|
| 1 | 布料微摆的阴影不跟随（阴影静态化） | 稳态省一次场景深度 pass，60fps 最大单项 GPU 节省 | 5.2 |
| 2 | 湿地「彩色反光」用贴花近似而非真实反射 | 0 额外渲染目标；三渲二语境已达标 | 5.5/R5 |
| 3 | 后期描边接口保留但只实现反壳 | 全屏 pass 归零；400 组合零分支 | 5.3 |
| 4 | 内饰照亮不占点光（emissive+窗内染色） | 点光预算恒 ≤2（车内暖光+火光） | 5.5、3.7 |
| 5 | 不引入 linter/框架/图标包等非必要依赖 | runtime 仅 three；离线绝对可靠 | 二 |
| 6 | 不持久化任何 UI/组合状态 | 严格满足十一.1「打开即玩默认组合」 | 6.5/U5 |
| 7 | 拖挂+皮卡注册为单一车型模块（D4） | 组合落位/对位逻辑唯一，避免双模块漂移 | 4.2.3 |
| 8 | file:// 双击直开默认不支持（ES module CORS） | 产物形态最简；备选 singlefile 插件留用户拍板 | 2.7 |
| 9 | 降雪不封冻水面（Q3/B7） | 与原文枚举一致，避免水体状态机复杂化 | 4.4.2 |
| 10 | 末世蒙尘涂装默认关闭（Q2） | 任何组合保持干净治愈观感 | 4.2/Q2 |

### 9.9 风险与任务的映射

| 风险 | 首要缓解任务 | 兜底任务 |
|---|---|---|
| R1 补丁耦合 | T06 冒烟 | T43/T44 |
| R2 DC 超预算 | T02 计数器→T05 实例化 | T44 实测回填 |
| R3 overdraw | T11 halo 预算 | T44 夜/雾专项 |
| R5 观感 | T45 默认组合定调 | T43/T46 |
| R6 描边破面 | T16 规范→T18 崖体验证 | T43 |
| R8 程序化精度 | T23/T25 名牌件打磨 | T43 |
| R12 雾叠加 | T14 单通道→T34 合成核验 | T46 |
| R13 句柄泄漏 | T17 泄漏测试 | T40/T46 |
| R15 半径契约 | T28 仲裁复核 | T46 |
| R16 接口漂移 | §3.9 决议表→T04 types | T48 回写 |
| R18/R19 流程红线 | T01 门禁 | T48 待清理项清单 |

---

## 附：对照提示词逐节核对表

> 对照原文一～十一节逐节核对；状态含义：**已覆盖** = 本设计文档已给出完整方案与落点（实现期按第八章任务落实）；**待实现阶段落实** = 方案已定但达标与否依赖编码、实测或交付期动作。

| 原文章节 | 核心要求 | 本文档落点 | 状态 |
|---|---|---|---|
| 一、整体形式与美术总纲（1–6） | 网页三维陈列盒/三渲二六要素/正方形底座/轻 UI 无 HUD/治愈气质含末世/无人物 | 一.1、三（Engine/Controls/BaseAssembler）、四.0、五（全章）、六（全章）、4.0 无人物红线 | 已覆盖（一.2 观感定调与一.3 形式统一在 T43/T07 落实验收） |
| 二、场景系统（导言+2.1–2.5） | 4 场景解耦可扩展、15+12+13+12 组元素、注册表五部分硬性架构 | 一.2、四.1（逐场景）、三.3.2/3.6 | 已覆盖 |
| 三、车型系统（总则+3.1–3.6） | 5 车型解耦可扩展、两核心特征、细节量≥C 型、注册表四项硬性架构 | 一.3、四.2（逐车型）、三.3.3/3.6 | 已覆盖 |
| 四、时间系统（总则+1–5） | 四档全场景完整实现、光照预设+装饰物切换、1~2s 过渡、不许只换色调 | 一.4、4.3（全章）、三.3.4/3.5.3 | 已覆盖（数值为初值，T29/T32 实机勾验） |
| 五、天气系统（总则+1–6） | 五档任意组合有效、三要素、平滑过渡、综合光照 | 一.5、4.4（全章）、三.3.5 | 已覆盖（数值为初值，T30/T33/T34 实机勾验） |
| 六、UI 要求（1–5） | 四组图标+文字切换、组合标题、磨砂玻璃统一风格、隐藏 UI、三类切换逻辑与相机连续 | 一.6、六（全章） | 已覆盖 |
| 七、动效要求（导言+1–5） | 静止但活着、26 项场景动效、统一节奏/风力/布料 | 一.7、七（全章）、三.4 | 已覆盖（偶发节奏 T41 实机调参） |
| 八、技术约束与工程要求（1–5） | pnpm+Vite+Three.js+TS、纯程序化无 DCC、60fps+实例化、四注册表+六公共系统、自适应+触屏 | 一.8、二（全章）、三（全章）、五.6/5.7、六.7 | 已覆盖（**八.3 的 60fps 达标为待实现阶段落实项**——T44 实测） |
| 九、工作流程要求（1–5） | 文档先行审阅门禁、仅内置浏览器、按需复盘、删除清理红线 a–d、项目目录+本地 git 无远程 | 一.9、二.5/2.10、八（T01 门禁/T47/T48）、九.7 | 已覆盖（流程约束转为任务门禁与红线，执行贯穿实现期） |
| 十、工作过程文档要求（0–3） | DESIGN/TASKS/DEPENDENCIES 三文档随进度维护 | 一.10、三.2 目录、八（T01/T48） | 已覆盖（**更正**：TASKS.md 与 DEPENDENCIES.md 已随本文档一并产出并提交审阅——原「批准前不建」的记载与实际不符；批准后转为基线，随进度实时更新） |
| 十一、验收总则 | 打开即玩默认组合、400 组合巡游、全组合核心观感、逐节最终自查 | 一.11、四/五/六/七全章、八.8–8.9（T45/T46/T47）、附表 | **待实现阶段落实**（T45 第一眼印象定稿、T46 400 组合核验、T47 逐节自查+断网验证均为交付期动作） |

---

*本文档由 docs/drafts/（01–04 需求清单、10–18 分章草稿）合并而成，草稿原文保留于 docs/drafts/ 作过程稿（十.0）。本文档为九.1 规定的审阅稿：**经用户审阅并明确同意前，不进行任何编码、脚手架搭建或依赖安装**。实现期如需设计调整，按十.1 回写本文档保持文档与代码一致；本文档中标注 ★/「待用户确认」的拍板项（D1–D8、J1–J8、B1–B11、U1–U6、Q1–Q6、接口增补决议表 §3.9、B 型升顶补建、蒙尘默认关闭、file:// 直开备选等）请随审阅一并确认。*
