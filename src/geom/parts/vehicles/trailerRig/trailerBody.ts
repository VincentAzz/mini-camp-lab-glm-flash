// docs/01-整体架构.md §3.2 geom/parts/vehicles/trailerRig/trailerBody.ts —— T25 部件：流线拖挂厢体（分瓣法）。
// docs/03-车型模块.md §4.2.3「流线厢体（主体 Cylinder 横置 + 两端球冠 + 底部削平「罐头火腿」；★两侧大窗洞
//   用分瓣法：上/下半 Cylinder + 左右侧板带洞挤出拼装）」+ draft 12-车型模块 §5.2 行；docs/04 §5.5（paintCar
//   差异强制点：白 #f6f3ec + texTrailerBand 薄荷/粉线，渲染层零车型分支——贴图/材质由调用方工厂取用）。
// 几何约定：全部输出在「厢体局部系」（原点=厢体中心，+X 车头向、+Y 上、+Z 左），调用方整组摆位/整组缩放
//   （内衬壳三件套 ①innerShell 复用同一批几何 BackSide 缩放 0.94，真开洞内壁暖色透窗可见）。
// ★ 实现期裁定（如实登记）：
//   ① 「上/下两半 Cylinder」落地为上/下两个**扇区**（各跨顶/底 ±55°）：侧带（±55°..±90°）留白给带洞挤出
//      侧板——窗洞必须落在平面上才可 Shape.holes 真开洞（圆柱面无法开洞），扇区收窄是分瓣法的必然形式；
//      扇区边与侧板缘之间的环缝在鸟瞰下读作「侧板拼缝线」（实车 canned-ham 同款钣金缝）。
//   ② 「两端球冠」：前端=前鼻蛋壳（noseShell，球冠+Lathe 整流罩一体）；尾端=**椭圆平端面盘**（tailCap，
//      Shape.holes 真开双舷窗洞）——球面无法开洞，尾端球冠由椭圆盘端面承担（罐头火腿尾部平背为经典样式）。
// 分段纪律（docs/04 §5.7「部件分段数在工厂写死」）：扇区 24 段 / Lathe 18 段 / 挤出 curveSegments 8，全低配。
// ★ 禁止人形/人物几何（一.6）。
import * as THREE from 'three';
import type { SharedAssets } from '@/systems/handles';

export interface TrailerShellParams {
  /** 主体 Cylinder 段长（厢体局部 X 向；本车 2.2——组合总长 3.1 = 端面盘 0.45×2 + 段 2.2） */
  readonly sectionLength: number;
  /** 厢体半径（draft §5.2 定值 1.02） */
  readonly radius: number;
  /** y 向压扁系数（draft「压 y0.88」——底部削平读法） */
  readonly squashY: number;
  /** 底部削平钳位（厢体局部 y 下限；本车 −0.80 → 平底带宽 ~0.93） */
  readonly flatBottomY: number;
  /** 侧板范围（厢体局部 x/y；侧板厚度固定 0.045，外表面 z=±panelOuterZ 由调用方摆位） */
  readonly panel: { readonly x0: number; readonly x1: number; readonly y0: number; readonly y1: number };
  /** 侧大窗真开洞（厢体局部 x/y，圆角 r；【3.3-6】两侧大窗主透视面） */
  readonly windowHole: { readonly x0: number; readonly x1: number; readonly y0: number; readonly y1: number; readonly r: number };
  /** 尾端面盘位置（厢体局部 x，盘厚 0.06，外表面朝 −X） */
  readonly tailCapX: number;
  /** 双舷窗洞（尾端面盘 Shape 系：u=−z 横向 / v=y 竖向；draft「圆盘 Shape+2 圆洞」） */
  readonly portholes: readonly { readonly u: number; readonly v: number; readonly r: number }[];
  /** 前鼻蛋壳：基座（与主体段前端面相接）与尖端（厢体局部 x） */
  readonly noseBaseX: number;
  readonly noseTipX: number;
}

export interface TrailerShellGeometries {
  /** 上扇区（开口 Cylinder 段，跨顶部 ±55°；已在厢体局部系压扁/削平） */
  readonly topSector: THREE.BufferGeometry;
  /** 下扇区（跨底部 ±55°，底缘钳位削平） */
  readonly bottomSector: THREE.BufferGeometry;
  /** 带洞侧板（Shape 系 XY=厢体局部 x/y、厚 0.045 沿 Z 居中；调用方 z=±摆位、正反两侧同几何） */
  readonly sidePanel: THREE.BufferGeometry;
  /** 尾端面盘（椭圆盘 + 双舷窗真开洞；厚 0.06 沿 X 居中于 tailCapX） */
  readonly tailCap: THREE.BufferGeometry;
  /** 前鼻蛋壳（Lathe 整流罩，轴 +X 由 base 指向 tip，压扁后与厢体截面衔接） */
  readonly noseShell: THREE.BufferGeometry;
}

/** 顶点圆角多边形轮廓（逐角半径；同 classC roundedPolygon 手法——部件库内自持一份）。 */
function roundedPolygon(
  target: THREE.Path,
  points: readonly (readonly [number, number])[],
  radii: readonly number[],
): void {
  const n = points.length;
  const pt = (i: number): THREE.Vector2 => {
    const p = points[((i % n) + n) % n];
    if (!p) throw new Error('[trailerRig/trailerBody] 轮廓点越界');
    return new THREE.Vector2(p[0], p[1]);
  };
  for (let i = 0; i < n; i++) {
    const prev = pt(i - 1);
    const cur = pt(i);
    const next = pt(i + 1);
    const d1 = cur.clone().sub(prev).normalize();
    const d2 = next.clone().sub(cur).normalize();
    const r = Math.min(radii[i] ?? 0.08, cur.distanceTo(prev) * 0.45, cur.distanceTo(next) * 0.45);
    const a = cur.clone().sub(d1.multiplyScalar(r));
    const b = cur.clone().add(d2.multiplyScalar(r));
    if (i === 0) target.moveTo(a.x, a.y);
    else target.lineTo(a.x, a.y);
    target.quadraticCurveTo(cur.x, cur.y, b.x, b.y);
  }
  target.closePath();
}

/**
 * 流线厢体五件几何（分瓣法拼装；全部经 assets.geometry 缓存，外板/内衬壳/雪壳三方可复用同一份）。
 * 扇区截面约定：Cylinder θ=0 → +Z（左）、θ=π/2 → +Y（顶）；rotateZ(π/2) 后轴向 +X，截面 (y,z)=(r·sinθ, r·cosθ)。
 */
export function createTrailerShellGeometries(assets: SharedAssets, id: string, params: TrailerShellParams): TrailerShellGeometries {
  const { radius, squashY, sectionLength, flatBottomY } = params;
  const sectorHalf = 0.96; // ±55°：扇区缘 z=±0.585、y=±0.47——与侧板缘（±0.72）衔接留环缝（裁定①）

  const topSector = assets.geometry(`${id}|top-sector`, () => {
    const geometry = new THREE.CylinderGeometry(radius, radius, sectionLength, 24, 1, true, Math.PI / 2 - sectorHalf, sectorHalf * 2);
    geometry.rotateZ(Math.PI / 2); // 轴 Y → +X（车长向）
    geometry.scale(1, squashY, 1); // 压 y0.88（draft「罐头火腿」）
    geometry.computeVertexNormals();
    return geometry;
  });

  const bottomSector = assets.geometry(`${id}|bottom-sector`, () => {
    const geometry = new THREE.CylinderGeometry(radius, radius, sectionLength, 24, 1, true, (3 * Math.PI) / 2 - sectorHalf, sectorHalf * 2);
    geometry.rotateZ(Math.PI / 2);
    geometry.scale(1, squashY, 1);
    const position = geometry.getAttribute('position') as THREE.BufferAttribute; // 底部削平：y 钳位（裁定①配套）
    for (let i = 0; i < position.count; i++) {
      if (position.getY(i) < flatBottomY) position.setY(i, flatBottomY);
    }
    geometry.computeVertexNormals();
    return geometry;
  });

  const sidePanel = assets.geometry(`${id}|side-panel`, () => {
    const { x0, x1, y0, y1 } = params.panel;
    const { x0: hx0, x1: hx1, y0: hy0, y1: hy1, r } = params.windowHole;
    const shape = new THREE.Shape();
    roundedPolygon(shape, [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], [0.16, 0.16, 0.16, 0.16]);
    const hole = new THREE.Path();
    roundedPolygon(hole, [[hx0, hy0], [hx1, hy0], [hx1, hy1], [hx0, hy1]], [r, r, r, r]);
    shape.holes.push(hole);
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: 0.045, bevelEnabled: false, curveSegments: 8, steps: 1 });
    geometry.translate(0, 0, -0.0225); // 厚度沿 Z 居中（调用方 z=±panelOuterZ 摆位）
    geometry.computeVertexNormals();
    return geometry;
  });

  const tailCap = assets.geometry(`${id}|tail-cap`, () => {
    const shape = new THREE.Shape();
    shape.absellipse(0, 0, radius * 0.98, radius * squashY, 0, Math.PI * 2, false, 0);
    for (const hole of params.portholes) {
      const path = new THREE.Path();
      path.absellipse(hole.u, hole.v, hole.r, hole.r, 0, Math.PI * 2, true, 0);
      shape.holes.push(path);
    }
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: 0.06, bevelEnabled: false, curveSegments: 18, steps: 1 });
    // 尾端面盘与厢体同「底部削平」（椭圆下缘钳位 flatBottomY，避免端盘低于削平底）
    const capPosition = geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < capPosition.count; i++) {
      if (capPosition.getY(i) < flatBottomY) capPosition.setY(i, flatBottomY + 0.001);
    }
    geometry.translate(0, 0, -0.03);
    geometry.rotateY(Math.PI / 2); // (u,v,t)→(t,v,−u)：盘面法线 ±X，u→−Z、v→+Y（厚 0.06 居中）
    geometry.translate(params.tailCapX, 0, 0);
    geometry.computeVertexNormals();
    return geometry;
  });

  const noseShell = assets.geometry(`${id}|nose-shell`, () => {
    // Lathe 整流罩：轮廓自基座（r=radius）收到尖端（r≈0），轴 +Y → rotateZ(−π/2) 转轴 +X（尖端朝车头）
    const noseLen = params.noseTipX - params.noseBaseX;
    const profile: readonly (readonly [number, number])[] = [
      [radius, 0], [radius * 0.98, noseLen * 0.18], [radius * 0.88, noseLen * 0.4],
      [radius * 0.71, noseLen * 0.62], [radius * 0.47, noseLen * 0.82], [radius * 0.22, noseLen * 0.95], [0.001, noseLen],
    ];
    const geometry = new THREE.LatheGeometry(
      profile.map(([x, y]) => new THREE.Vector2(x, y)),
      18,
    );
    geometry.rotateZ(-Math.PI / 2); // 轴 +Y → +X：基座在 x0，尖端在 x0+noseLen
    geometry.scale(1, squashY, 1); // 与厢体截面同压扁（裁定②：前端球冠+整流罩一体）
    // 前鼻蛋壳同「底部削平」（y 钳位——蛋壳下缘不越过削平底）
    const nosePosition = geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < nosePosition.count; i++) {
      if (nosePosition.getY(i) < flatBottomY) nosePosition.setY(i, flatBottomY + 0.001);
    }
    geometry.translate(params.noseBaseX, 0, 0);
    geometry.computeVertexNormals();
    return geometry;
  });

  return { topSector, bottomSector, sidePanel, tailCap, noseShell };
}
