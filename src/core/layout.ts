// src/core/layout.ts —— ★ 布局约束系统（微缩营地巡游·可校验占位登记）：纯数据单一来源的校验核。
//
// 设计（本轮裁定，如实登记）：
//   ◆ 零 three/DOM 依赖——本文件与 src/content/layout/** 均为纯数据/纯逻辑模块，node 可直接
//     import（v24 原生 TS 类型剥离；content/layout/** 只允许 `import type` 引本文件，运行时
//     零 import，故 node 侧 '@/' 别名永不解析）。
//   ◆ 数据流：场景布置位置字面量 → src/content/layout/scenes/<scene>.ts 占位表（位置常量 +
//     LayoutItem[]）→ ① 场景 buildProps import 常量布置并调 LayoutGrid.register（浏览器内同源）
//     → ② Director（DEV）装配完成后 verify 并 console.error 报告违规（不阻断渲染）
//     → ③ scripts/check-layout.mjs（node）import 同一批数据模块做 4 场景 × 5 车型全矩阵校验。
//     ——场景与静态校验脚本共用同一份数据与同一套 verify 逻辑（LayoutGrid）。
//   ◆ 车辆包络圆：src/content/layout/vehicles.ts 导出 5 车型 envelopeRadius（外接圆半径，按
//     footprint 与落地外伸件实算，与 src/content/vehicles/*.ts 的 FOOTPRINT 常量同源——车身
//     长宽字面量唯一定义在 layout/vehicles.ts，车型文件反向 import）。圆模型对朝向天然免疫
//     （campAnchor heading 任意旋转不改变外接圆）。
//   ◆ 规则（verify）：
//       1) 车辆包络圆 vs kind='prop' 道具圆：净距 ≥ VEHICLE_PROP_MIN_GAP(0.25)——不可豁免；
//       2) prop × prop：净距 ≥ PROP_PROP_MIN_GAP(0.01)——同 cluster 登记的贴邻组合豁免
//          （如「火圈↔凳环」「天幕↔桌椅」——cluster 字段声明，note 说明设计贴邻依据）；
//       3) kind='terrain'（地形一体构件：平台/桥/护栏/围墙/建筑等）：登记占表供对账与巡览，
//          不参与车辆规则与两两规则——其包络圆为曲线/组合体的粗近似，逐对校验会产生系统性
//          伪命中（如栈道贴营位、围墙横贯全场）；真实相交由页内 Box3 探针兜底（白名单口径
//          「底座↔贴地物/地形件」）。reason 必填，说明豁免依据。
//   ◆ 运行期散布件（松林松环×38/蕨菇苔、海崖礁石海草、服务区灌木等 rng 散布植被）不进静态
//     占位表，由场景侧散布避让规则自律（如 pineforest canPlaceTree 营位净空半径），见各
//     layout 数据文件头注记。
/** 道具占位类别：prop=可移式营位道具（受全部规则约束）/ terrain=地形一体构件（只登记不校验）。 */
export type LayoutKind = 'prop' | 'terrain';

/** 车型包络条目（src/content/layout/vehicles.ts 数据表行；类型归 core 契约面——core 不 import content）。 */
export interface VehicleEnvelope {
  /** 车型 id（与 vehicles/registry 注册 id 一致） */
  readonly id: string;
  /** 外接圆半径（营位锚点到最大落地/悬空外伸沿的实算最大距离，含点名外伸件） */
  readonly envelopeRadius: number;
  /** 实算依据注记（逐项列出计入的平面外伸件与其尺寸来源） */
  readonly note: string;
}

/** 场景道具占位条目（位置常量与半径按真实几何如实登记，不虚大）。 */
export interface LayoutItem {
  /** 稳定 id（违规报告与豁免对照用；如 'seacliff/tarp'） */
  readonly id: string;
  /** 布置位 x（世界系，营位锚点坐标系与场景布置逐字一致） */
  readonly x: number;
  /** 布置位 z */
  readonly z: number;
  /** 包围半径（按真实几何实算：最大落地外沿；悬空布面按其投影计） */
  readonly radius: number;
  /** 类别（prop 受规则约束 / terrain 只登记） */
  readonly kind: LayoutKind;
  /** 同 cluster id 的道具两两贴邻豁免（如 'pineforest/campfire'） */
  readonly cluster?: string;
  /** 登记/豁免依据说明（terrain 必填；cluster 贴邻建议填写） */
  readonly note?: string;
}

/** 布局违规（check:layout 报告与 Director DEV console.error 共用结构）。 */
export interface LayoutViolation {
  readonly sceneId: string;
  readonly vehicleId: string | null;
  /** vehicle-prop=车辆包络侵入 / prop-prop=道具贴面 */
  readonly type: 'vehicle-prop' | 'prop-prop';
  readonly aId: string;
  readonly bId: string;
  /** 实际净距（圆边最小间距，负值=侵入量） */
  readonly gap: number;
  /** 要求净距（0.25 / 0.01） */
  readonly required: number;
}

/** 车辆 vs 道具最小净距（本轮红线，docs 定值）。 */
export const VEHICLE_PROP_MIN_GAP = 0.25;
/** 道具两两最小净距（贴面清零线）。 */
export const PROP_PROP_MIN_GAP = 0.01;

/** 两圆净距（中心距 − 半径和；负=侵入）。 */
export function circleGap(ax: number, az: number, ar: number, bx: number, bz: number, br: number): number {
  return Math.hypot(ax - bx, az - bz) - ar - br;
}

/**
 * 布局约束核：场景占位登记 + 车辆包络注入 + 规则校验。
 * —— 场景 buildProps 与 scripts/check-layout.mjs 共用同一实例与同一 verify 实现。
 */
/** 场景营位锚点平面位（车辆包络圆圆心=车型停驻位，Director 按 campAnchor 对位）。 */
export interface LayoutCampAnchor {
  readonly x: number;
  readonly z: number;
}

export class LayoutGrid {
  private readonly scenes = new Map<string, LayoutItem[]>();
  private readonly anchors = new Map<string, LayoutCampAnchor>();
  private readonly envelopes = new Map<string, VehicleEnvelope>();
  private warnedMissingEnvelope = false;

  /** 登记一个场景的占位表与营位锚点（重建/换场重入时整表替换，无累积重复）。 */
  register(sceneId: string, items: readonly LayoutItem[], anchor: LayoutCampAnchor): void {
    this.scenes.set(sceneId, [...items]);
    this.anchors.set(sceneId, { ...anchor });
  }

  /** 注入车型包络表（main.ts 组装点 / check 脚本；重复注入整表替换）。 */
  setVehicleEnvelopes(items: readonly VehicleEnvelope[]): void {
    this.envelopes.clear();
    for (const item of items) this.envelopes.set(item.id, item);
  }

  itemsOf(sceneId: string): readonly LayoutItem[] {
    return this.scenes.get(sceneId) ?? [];
  }

  envelopeOf(vehicleId: string): VehicleEnvelope | undefined {
    return this.envelopes.get(vehicleId);
  }

  get envelopeCount(): number {
    return this.envelopes.size;
  }

  /**
   * 校验一个场景 × 一个车型：返回违规明细（空数组=全绿）。
   * 包络表未注入/车型未登记 → 返回空表并一次性 warn（不阻断装配， check 脚本侧不受影响）。
   */
  verify(sceneId: string, vehicleId: string): LayoutViolation[] {
    const envelope = this.envelopes.get(vehicleId);
    if (!envelope) {
      if (!this.warnedMissingEnvelope) {
        this.warnedMissingEnvelope = true;
        // 包络表缺席多为组装点漏注入（main.ts/check 脚本），一次性提示即可
        console.warn(`[layout] 车型包络表未登记 vehicleId=${vehicleId}——跳过车辆规则校验`);
      }
      return [];
    }
    const items = this.scenes.get(sceneId) ?? [];
    const anchor = this.anchors.get(sceneId) ?? { x: 0, z: 0 };
    const violations: LayoutViolation[] = [];
    for (const item of items) {
      if (item.kind !== 'prop') continue; // terrain 只登记不校验（文件头设计注记）
      // 规则 1：车辆包络圆（圆心=营位锚点，车型停驻位）vs 道具圆 ≥ 0.25（不可豁免）
      const gapVehicle = circleGap(item.x, item.z, item.radius, anchor.x, anchor.z, envelope.envelopeRadius);
      if (gapVehicle < VEHICLE_PROP_MIN_GAP) {
        violations.push({
          sceneId,
          vehicleId,
          type: 'vehicle-prop',
          aId: vehicleId,
          bId: item.id,
          gap: gapVehicle,
          required: VEHICLE_PROP_MIN_GAP,
        });
      }
      // 规则 2：道具两两 ≥ 0.01（同 cluster 贴邻豁免）
      for (const other of items) {
        if (other.kind !== 'prop') continue;
        if (other.id <= item.id) continue; // 无序对去重（id 字典序单侧遍历）
        if (item.cluster !== undefined && item.cluster === other.cluster) continue; // cluster 贴邻豁免
        const gapPair = circleGap(item.x, item.z, item.radius, other.x, other.z, other.radius);
        if (gapPair < PROP_PROP_MIN_GAP) {
          violations.push({
            sceneId,
            vehicleId,
            type: 'prop-prop',
            aId: item.id,
            bId: other.id,
            gap: gapPair,
            required: PROP_PROP_MIN_GAP,
          });
        }
      }
    }
    return violations;
  }
}

/** 全局唯一布局核（场景 buildProps / Director / check 脚本共用）。 */
export const layoutGrid = new LayoutGrid();
