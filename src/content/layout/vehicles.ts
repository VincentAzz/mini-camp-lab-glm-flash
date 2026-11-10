// src/content/layout/vehicles.ts —— ★ 车型包络表（布局约束系统·车辆侧单一来源）。
//
// 纯数据模块（零 import / 零 three / 零 DOM）：node 直接 import（v24 类型剥离无需编译）。
// 同源引用（本轮架构裁定）：车身接地长宽的字面量唯一定义于本文件 VEHICLE_BODIES，
// src/content/vehicles/*.ts 的 FOOTPRINT 常量反向 import 本表（length/width 逐字同源，
// track/height 仍属车型几何细节留在车型文件）；envelopeRadius 由本文件按「footprint 外接圆
// ∪ 点名落地外伸件外接圆」实算——圆模型对 campAnchor.heading 任意朝向天然免疫。
//
// 外接圆计入口径（★用户点名外伸件逐项落实，悬空布面不入圆）：
//   ◆ trailerRig：拖挂组合双体 8.0×2.5 → hypot(4.0,1.25)=4.193。皮卡/拖挂车身、支撑腿（落地
//     但在平面内）、牵引杆均在平面内；右侧遮阳棚布为壁挂悬空面（外沿 y≈1.71 悬空，无落地杆）
//     不计入——低道具自其下通过，页内探针兜底。
//   ◆ classA：车体 7.9×2.7 → hypot(3.95,1.35)=4.175；尾部自行车架横杆（x −4.40、z ±0.75，
//     y 0.82 落物高度）→ hypot(4.40,0.75)=4.464 取最大；前脸 fascia x 4.015 → 4.236 次之。
//     左壁遮阳棚布悬空 y 2.42 不计入。
//   ◆ classC：车体 6.4×2.6 → hypot(3.2,1.3)=3.454；滑出舱外伸（舱体 x −3.2..−0.95、外沿
//     z −2.10，F.slideOuterZ）→ hypot(3.2,2.10)=3.828 取最大；升顶楔在平面内。
//   ◆ classB：车体 4.7×2.2 → hypot(2.35,1.1)=2.596；后掀尾门 70° 悬停翼尖（铰链 x −2.35、
//     门板 1.62 → 翼尖 x −3.87、y≈1.47、z ±1.0）→ hypot(3.87,1.0)=3.997 取最大——翼板为
//     y 1.5 高实板，从严计入（低道具自其下通过时由页内探针兜底）。
//   ◆ overlandTruck：车体 5.2×2.3 → hypot(2.6,1.15)=2.845；车顶帐篷下壳外伸（x −3.18、
//     z ±0.575，悬空 y≥2.01）→ 3.232；尾梯落地（x −3.59、z ±0.1，F.ladderFootX）→ 3.594
//     取最大；侧边遮阳幕支臂（双立杆 z 2.35、x −0.3±1.3）→ hypot(1.6,2.35)=2.845 次之。
//     幕布斜张面不计入（悬空）。
import type { VehicleEnvelope } from '@/core/layout';

/** 车身接地长宽（footprint 字面量唯一来源；车型文件反向 import 同源引用）。 */
export const VEHICLE_BODIES = {
  trailerRig: { length: 8.0, width: 2.5 },
  classA: { length: 7.9, width: 2.7 },
  classC: { length: 6.4, width: 2.6 },
  classB: { length: 4.7, width: 2.2 },
  overlandTruck: { length: 5.2, width: 2.3 },
} as const;

/** 车体长宽外接圆半径（实算函数——纯数学，node/浏览器同值）。 */
function bodyRadius(id: keyof typeof VEHICLE_BODIES): number {
  const body = VEHICLE_BODIES[id];
  return Math.hypot(body.length / 2, body.width / 2);
}

/** 5 车型包络表（check:layout 与 Director DEV verify 共用；id 与 vehicles/registry 注册 id 一致）。 */
export const VEHICLE_ENVELOPES: readonly VehicleEnvelope[] = [
  {
    id: 'trailerRig',
    envelopeRadius: Math.max(bodyRadius('trailerRig'), Math.hypot(4.0, 1.25)),
    note: '拖挂组合双体 8.0×2.5 → hypot(4.0,1.25)=4.193；遮阳棚布悬空 y≥1.71 不计入（壁挂无落地杆）',
  },
  {
    id: 'classA',
    envelopeRadius: Math.max(bodyRadius('classA'), Math.hypot(4.4, 0.75)),
    note: '车体 7.9×2.7=4.175 ∪ 尾部自行车架横杆 hypot(4.40,0.75)=4.464（x −4.40/z ±0.75，y 0.82）取最大；壁挂棚布悬空 y 2.42 不计入',
  },
  {
    id: 'classC',
    envelopeRadius: Math.max(bodyRadius('classC'), Math.hypot(3.2, 2.1)),
    note: '车体 6.4×2.6=3.454 ∪ 滑出舱外伸 hypot(3.2,2.10)=3.828（F.slideOuterZ=−2.10）取最大；升顶楔平面内',
  },
  {
    id: 'classB',
    envelopeRadius: Math.max(bodyRadius('classB'), Math.hypot(3.87, 1.0)),
    note: '车体 4.7×2.2=2.596 ∪ 后掀尾门 70° 悬停翼尖 hypot(3.87,1.0)=3.997（x −3.87/y≈1.47/z ±1.0）从严计入',
  },
  {
    id: 'overlandTruck',
    envelopeRadius: Math.max(bodyRadius('overlandTruck'), Math.hypot(3.59, 0.1)),
    note: '车体 5.2×2.3=2.845 ∪ 尾梯落地 hypot(3.59,0.1)=3.594（F.ladderFootX=−3.59）取最大；帐篷下壳 x −3.18=3.232、遮阳幕支臂 z 2.35=2.845 次之；幕布悬空不计入',
  },
];
