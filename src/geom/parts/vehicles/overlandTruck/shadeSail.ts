// docs/01-整体架构.md §3.2 geom/parts/vehicles/overlandTruck/ —— T27 越野皮卡专用部件：侧边遮阳幕。
// docs/03-车型模块.md §4.2.5「侧边遮阳幕：双立杆+斜张 Plane(2.8,2.0)+texWeaveShade α0.6，ClothHandle 0.4」；
// draft 12-车型模块 §7.1「双立杆+斜张 Plane(2.8,2.0)」（DeploymentPart kind 'awning'）。
// 输出约定：幕布=Plane(2.8,slant) 细分+uv 重排（固定边=贴车身内缘长边——wind.ts 定点约定）；
//   立杆组（双立杆+脚盘）合并单几何。幕布 Mesh 与材质在此组装（布面朝向/落位由调用方承担）。
// ★ 禁止人形/人物几何（一.6）。
import * as THREE from 'three';
import type { SharedAssets } from '@/systems/handles';
import { toonMaterials } from '@/render/toonMaterial';
import { hardenEdges, mergeGeometries } from '@/geom/primitives';

export interface ShadeSailParams {
  /** 幕布长（沿车长 X；2.8） */
  readonly length: number;
  /** 幕布斜张宽（内缘→外缘斜距；2.0） */
  readonly slant: number;
  /** 织纹贴图（texWeaveShade，调用方经 assets.texture 生成） */
  readonly map: THREE.Texture;
  /** 立杆高度（杆顶微过幕布外缘；缺省 slant×0.6） */
  readonly poleHeight?: number;
  /** 材质/几何 name 前缀（缓存键） */
  readonly name?: string;
}

export interface ShadeSailResult {
  /** 幕布 Mesh（ClothHandle 用；调用方定 rotation/position——斜张角度） */
  readonly sailMesh: THREE.Mesh;
  /** 幕布材质（cloth toon α0.6；WeatherSurface 不注册——外遮阳幕非积水顶面，Q2 口径） */
  readonly sailMaterial: THREE.MeshToonMaterial;
  /** 双立杆组（落地件，金属材质已配） */
  readonly polesGroup: THREE.Group;
}

/** 侧边遮阳幕：斜张幕布（α0.6 织纹）+双立杆。幕布局部 X=车长向、Y=斜张向（+Y 端=内缘/高侧）。 */
export function createShadeSail(assets: SharedAssets, id: string, params: ShadeSailParams): ShadeSailResult {
  const { length, slant, map } = params;
  const name = params.name ?? `${id}/sail`;
  const cacheId = `${id}|${length}|${slant}`;

  const sailMaterial = toonMaterials.getToon('cloth', {
    color: '#8a9180', map, opacity: 0.6, outline: false, name: `${name}/sail`,
  });
  sailMaterial.side = THREE.DoubleSide; // 工厂无 side 参数——唯一 name 缓存键内设置
  const sailGeometry = assets.geometry(`${cacheId}/sail`, () => {
    const geometry = new THREE.PlaneGeometry(length, slant, 10, 6);
    const uv = geometry.getAttribute('uv') as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) {
      // 固定边=内缘长边（局部 +Y 端）：uv.x=0 内缘 → 1 外缘
      const v = uv.getY(i);
      uv.setX(i, 1 - v);
    }
    uv.needsUpdate = true;
    geometry.computeVertexNormals();
    return geometry;
  });
  const sailMesh = new THREE.Mesh(sailGeometry, sailMaterial);
  sailMesh.name = `${name}/sail`;
  sailMesh.userData.noOutline = true;
  sailMesh.castShadow = false;

  // 双立杆（落地）+脚盘：合并单几何，杆顶微过幕布外缘（绑扎读法）
  const polesGroup = new THREE.Group();
  polesGroup.name = `${name}/poles`;
  const poleGeometry = assets.geometry(`${cacheId}/poles`, () => {
    const poleHeight = params.poleHeight ?? slant * 0.6;
    const parts: THREE.BufferGeometry[] = [];
    for (const x of [-length * 0.42, length * 0.42]) {
      const pole = new THREE.CylinderGeometry(0.026, 0.03, poleHeight, 8);
      pole.translate(x, poleHeight / 2, 0);
      parts.push(hardenEdges(pole));
      const foot = new THREE.CylinderGeometry(0.09, 0.1, 0.02, 10);
      foot.translate(x, 0.01, 0);
      parts.push(hardenEdges(foot));
    }
    const merged = mergeGeometries(parts);
    if (!merged) throw new Error(`[overlandTruck/shadeSail] 立杆合并失败：${cacheId}`);
    return merged;
  });
  const poles = new THREE.Mesh(poleGeometry, toonMaterials.get('metal', { color: '#4a4d52', name: `${name}/pole` }));
  poles.name = `${name}/poles-mesh`;
  poles.castShadow = true;
  polesGroup.add(poles);

  return { sailMesh, sailMaterial, polesGroup };
}
