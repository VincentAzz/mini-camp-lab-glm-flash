// docs/01-整体架构.md §3.2 geom/parts/pineforest/hammock.ts —— 可复用部件库 hammock（松林首创）。
// docs/02-场景模块.md §4.1.2 2.2.2-①：「吊床（Plane 顶点预弯垂弧+绑绳；ClothHandle stiffness 0.3，
//   7-2-⑤）」；docs/05-时间天气动效.md §7.1.2 布料总表「吊床 0.3/1.0/0」；7-2-⑤「吊床轻晃
//   （rotation.z 摆 ±2°×gust+布纹波动）」——rotation 属刚体姿态、WindSystem 能力为顶点位移
//   （docs/01 §3.4 归属裁定），本件以「中心加权顶点摆」近似 ±2° 轻晃：
//   自定义 UV（uv.x=|2u−1|，两端=0）→ wind.ts 布料块 edgeW=clamp(uv.x) 两端锚固、中段摆幅最大，
//   布纹波动（双频 sin）与 gust 包络由 WindSystem 统一驱动，场景零布料代码（D3）。
// ★ 禁止人形/人物几何（一.6）。T19 落点。
import * as THREE from 'three';
import type { ClothHandle, SharedAssets } from '@/systems/handles';
import { toonMaterials } from '@/render/toonMaterial';
import { mergeGeometries, tube } from '@/geom/primitives';

export interface HammockParams {
  readonly assets: SharedAssets;
  /** 缓存/日志 id */
  readonly id: string;
  /** 两树间距（绑绳端距，u） */
  readonly span: number;
  /** 布面宽（沿两树连线）与深 */
  readonly width?: number;
  readonly depth?: number;
  /** 预弯垂弧深度（u，2.2.2-①「顶点预弯垂弧」） */
  readonly sag?: number;
  /** 布色 */
  readonly color?: string;
}

export interface HammockResult {
  /** 布料网格（挂到场景组；位置=两树中点、吊挂高度由调用方 position.y） */
  readonly mesh: THREE.Mesh;
  /** ClothHandle → WindSystem（stiffness 0.3，§7.1.2 吊床行） */
  readonly handle: ClothHandle;
}

/** 吊床：预弯垂弧布面 + ClothHandle（两端锚固、中心轻晃）+ 两端绑绳（Tube 1 DC）。原点=布面中心。 */
export function createHammock(params: HammockParams): HammockResult {
  const { assets, id } = params;
  const span = params.span;
  const width = params.width ?? span * 0.82;
  const depth = params.depth ?? 0.72;
  const sag = params.sag ?? 0.42;

  const geometry = assets.geometry(`${id}/cloth`, () => {
    // Plane：x 沿两树连线（width），y 为布深（depth）；12×8 分段（§7.1.2 布料网格纪律）
    const plane = new THREE.PlaneGeometry(width, depth, 12, 8);
    // 竖放：布深方向转为竖直下垂（+y 顶边=绑绳边）
    const position = plane.getAttribute('position') as THREE.BufferAttribute;
    const uv = plane.getAttribute('uv') as THREE.BufferAttribute;
    for (let i = 0; i < position.count; i++) {
      const u = uv.getX(i); // 0..1 沿 width
      const v = uv.getY(i); // 0..1 沿 depth
      // 预弯垂弧：沿长度 sin 半波；布深方向越靠下（v 小）弧深越大
      const hang = Math.sin(Math.PI * u) * sag * (0.55 + 0.45 * v);
      position.setY(i, position.getY(i) - hang);
      // 横向兜曲：布深方向微收（两端上翘的船形）
      position.setZ(i, position.getZ(i) + Math.sin(Math.PI * u) * 0.1);
      // ★ 自定义 UV：uv.x=|2u−1| —— wind.ts 布料块 edgeW=uv.x → 两端(=0)锚固、中段(=1)满摆
      uv.setX(i, Math.abs(2 * u - 1));
    }
    position.needsUpdate = true;
    uv.needsUpdate = true;
    plane.computeVertexNormals();
    plane.computeBoundingSphere();
    return plane;
  });
  const material = toonMaterials.get('cloth', { color: params.color ?? '#d8734f', name: `${id}/cloth` });
  material.side = THREE.DoubleSide; // 工厂无 side 参数——唯一 name 缓存键内设置（吊床上下可见）
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = id;
  mesh.castShadow = true; // §4.3.3-⑤：布料 castShadow（customDepthMaterial 由 WindSystem 注册时挂）
  const handle: ClothHandle = {
    mesh,
    swayAxes: ['y', 'z'], // 世界系经模型矩阵还原——中心轻晃（布深向起伏 + 横向微摆）
    stiffness: 0.3, // docs/05 §7.1.2 吊床行（7-2-⑤）
    windFactor: 1.0,
    sagAmp: 0,
  };

  // —— 绑绳：两端各 1 根斜拉绳（Tube 合并 1 DC；局部 x=±width/2 端）——
  const ropeGeometry = assets.geometry(`${id}/ropes`, () => {
    const hw = width / 2;
    const ropes = [-1, 1].map((side) => {
      const points = [
        new THREE.Vector3(side * hw, 0.06, 0),
        new THREE.Vector3(side * (span / 2), 0.32, 0),
      ];
      return tube({ pointsOrCurve: points, radius: 0.011, tubularSegments: 6, radialSegments: 5 });
    });
    const merged = mergeGeometries(ropes);
    if (!merged) throw new Error(`[hammock] 绑绳合并失败 ${id}`);
    return merged;
  });
  const ropes = new THREE.Mesh(ropeGeometry, toonMaterials.get('matteProp', { color: '#8a7a62', name: `${id}/ropes` }));
  ropes.name = `${id}/ropes`;
  mesh.add(ropes); // 绳随布面根组（不参与顶点风摆——绳为刚性件）

  return { mesh, handle };
}
