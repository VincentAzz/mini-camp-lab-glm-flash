// docs/01-整体架构.md §3.2 geom/parts/vehicleKit/pleatedBand.ts —— 部件库首批：风琴褶带。
// docs/03-车型模块.md §4.2.0 vehicleKit 表「pleatedBand：锯齿三角带 BufferGeometry（风琴褶）」；
// 使用者：C 型升顶帐帘带（§4.2.1，褶 14 深 0.05）/ C 型滑出舱风琴套（褶 10 横向）等。
// 输出约定：竖直条带——宽沿局部 X、高沿局部 Y、褶齿沿局部 Z 往复（depth 为峰谷全幅）；
//   uv.x=0..1 沿宽向（WindSystem 布料补丁以 uv.x 为「固定边→自由边」加权，wind.ts 定点约定）。
// 顶点手工构造（无索引网格依赖），法线重算；分段纪律：列数 = 褶数×2+1（§5.7 低配）。
// ★ 禁止人形/人物几何（一.6）。
import * as THREE from 'three';

export interface PleatedBandParams {
  /** 条带宽（局部 X 向展开长） */
  readonly width: number;
  /** 条带高（局部 Y 向） */
  readonly height: number;
  /** 褶数（每褶 = 一峰一谷两列） */
  readonly pleats: number;
  /** 褶深（峰谷全幅；峰谷各 ±depth/2） */
  readonly depth: number;
}

/** 风琴褶带几何：竖直条带（宽 X × 高 Y），褶齿沿 Z 往复；条带中心在原点。 */
export function createPleatedBandGeometry(params: PleatedBandParams): THREE.BufferGeometry {
  const { width, height, depth } = params;
  const pleats = Math.max(1, Math.round(params.pleats));
  const columns = pleats * 2 + 1;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i < columns; i++) {
    const t = i / (columns - 1);
    const x = (t - 0.5) * width;
    const z = (i % 2 === 0 ? 1 : -1) * depth * 0.5;
    positions.push(x, height / 2, z, x, -height / 2, z);
    uvs.push(t, 1, t, 0);
  }
  for (let i = 0; i < columns - 1; i++) {
    const a = i * 2;
    indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}
