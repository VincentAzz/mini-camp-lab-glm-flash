// docs/01-整体架构.md §3.2 geom/primitives.ts —— 基础体封装、Lathe/Extrude 帮手
// （八.2 红线：全部代码生成，禁止任何模型文件；禁止任何人形/人物几何——一.6，由 geom/parts 部件库铁律继续把关）。
// docs/04-三渲二渲染.md：
//   - §5.7「部件分段数在工厂写死」——本层默认分段全部低配（lathe 16 / tube 8×24 / extrude 8 / roundedBox 2）；
//   - §5.3 硬边处理——需要描边的方硬部件用 hardenEdges（toNonIndexed + computeVertexNormals），
//     平滑曲面（lathe/tube）保持共享法线不动。
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

// 合批帮手按 §5.6 随包离线合规（three 内建 BufferGeometryUtils），供 parts 层「≥5 同材质同组合并」取用。
export { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// ---------------------------------------------------------------------------
// 圆角盒（桌体/箱体/车身块等方硬部件的基本体）
// ---------------------------------------------------------------------------

export interface RoundedBoxParams {
  width: number;
  height: number;
  depth: number;
  /** 圆角半径；默认 0.04，自动钳到最短边一半以内（addons 内部同样有钳制，这里提前给出可预期值） */
  radius?: number;
  /** 圆角分段：默认 2（微缩观感足够，§5.7 分段纪律） */
  segments?: number;
}

export function roundedBox(params: RoundedBoxParams): THREE.BufferGeometry {
  const { width, height, depth } = params;
  const shortest = Math.min(width, height, depth);
  const radius = Math.min(params.radius ?? 0.04, shortest / 2 - 1e-4);
  const segments = Math.max(1, params.segments ?? 2);
  return new RoundedBoxGeometry(width, height, depth, segments, Math.max(radius, 1e-4));
}

// ---------------------------------------------------------------------------
// 轮廓挤出（集装箱棱边/招牌体/路缘/小屋剖面等「平面轮廓 + 厚度」部件）
// ---------------------------------------------------------------------------

export interface ProfileExtrudeParams {
  /** XY 平面多边形轮廓（单位：世界坐标；生成后沿 Z 挤出） */
  profile: readonly (readonly [number, number])[];
  /** 挤出厚度（Z 向） */
  depth: number;
  bevelEnabled?: boolean;
  bevelThickness?: number;
  bevelSize?: number;
  bevelSegments?: number;
  /** 轮廓圆弧细分（§5.7 低配默认 8） */
  curveSegments?: number;
  steps?: number;
  /** 沿挤出轴居中（默认 true，便于部件以自身中点对位） */
  center?: boolean;
}

export function profileExtrude(params: ProfileExtrudeParams): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape(params.profile.map(([x, y]) => new THREE.Vector2(x, y)));
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: params.depth,
    bevelEnabled: params.bevelEnabled ?? false,
    bevelThickness: params.bevelThickness ?? 0.02,
    bevelSize: params.bevelSize ?? 0.02,
    bevelSegments: params.bevelSegments ?? 1,
    curveSegments: params.curveSegments ?? 8,
    steps: params.steps ?? 1,
  });
  if (params.center ?? true) {
    geometry.translate(0, 0, -params.depth / 2);
  }
  return geometry;
}

// ---------------------------------------------------------------------------
// 旋转成型（灯塔体/水箱/油桶/篝火石圈等回转体；平滑法线保持共享，§5.3）
// ---------------------------------------------------------------------------

export interface LatheParams {
  /** 回转轮廓（X=半径≥0，Y=高度），自下而上 */
  profile: readonly (readonly [number, number])[];
  /** 圆周分段：默认 16（§5.7 低配） */
  segments?: number;
  phiStart?: number;
  phiLength?: number;
}

export function lathe(params: LatheParams): THREE.LatheGeometry {
  const points = params.profile.map(([x, y]) => new THREE.Vector2(Math.max(0, x), y));
  return new THREE.LatheGeometry(
    points,
    params.segments ?? 16,
    params.phiStart ?? 0,
    params.phiLength ?? Math.PI * 2,
  );
}

// ---------------------------------------------------------------------------
// 管件（串灯电线/晾衣绳/栏杆弯头/水管；沿 CatmullRom 平滑曲线扫掠）
// ---------------------------------------------------------------------------

export interface TubeParams {
  /** 途经点（世界单位）或现成曲线 */
  pointsOrCurve: readonly THREE.Vector3[] | THREE.Curve<THREE.Vector3>;
  radius?: number;
  /** 长向分段：默认 24（§5.7 低配） */
  tubularSegments?: number;
  /** 圆周分段：默认 8（§5.7 低配） */
  radialSegments?: number;
  closed?: boolean;
  curveType?: THREE.CurveType;
}

export function tube(params: TubeParams): THREE.TubeGeometry {
  const curve = params.pointsOrCurve instanceof THREE.Curve
    ? params.pointsOrCurve
    : new THREE.CatmullRomCurve3([...params.pointsOrCurve], params.closed ?? false, params.curveType ?? 'catmullrom', 0.5);
  return new THREE.TubeGeometry(
    curve,
    params.tubularSegments ?? 24,
    params.radius ?? 0.02,
    params.radialSegments ?? 8,
    params.closed ?? false,
  );
}

// ---------------------------------------------------------------------------
// 硬边处理（§5.3：需要描边的部件按面拆分顶点法线，反壳描边才不糊边）
// ---------------------------------------------------------------------------

/**
 * 按面拆分顶点法线：toNonIndexed 后重算法线（平面块部件的 toon 色带与描边都更「利」）。
 * 已是非索引几何时原几何上重算法线（three 的 toNonIndexed 对非索引几何原样返回）。
 * 注意：输出几何不与输入共享顶点缓冲，调用方应二选一使用。
 */
export function hardenEdges(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  const flat = geometry.index !== null ? geometry.toNonIndexed() : geometry;
  flat.computeVertexNormals();
  return flat;
}
