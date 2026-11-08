// docs/01-整体架构.md §3.2 geom/parts/vehicles/trailerRig/jackLeg.ts —— T25 部件：拖挂支撑腿。
// docs/03-车型模块.md §4.2.0 vehicleKit 表「jackLeg」+ §4.2.3【3.3-3】「支撑腿 ×2 jackLeg 放下触地」；
//   draft 12-车型模块 §5.2 行「前鼻下方左右，放下触地」。展开机构差异点（docs/03 §4.2.6）：拖挂=
//   jackLeg（垂直伸缩触地，别于 C 垂直抬升/B 后掀/越野双壳上翻）。
// 输出约定：组原点=车底挂点，支腿向下伸出（deployed 态=内管全伸出、脚盘贴地）；调用方按车底高度摆位。
// ★ 禁止人形/人物几何（一.6）。
import * as THREE from 'three';
import type { SharedAssets } from '@/systems/handles';
import { toonMaterials } from '@/render/toonMaterial';
import { hardenEdges, mergeGeometries, roundedBox } from '@/geom/primitives';

export interface JackLegParams {
  /** 放下态全长（挂点→脚盘底；调用方按「车底挂点高度≈全长」摆位使脚盘贴地） */
  readonly drop: number;
  /** 工厂几何/材质缓存键前缀 */
  readonly name: string;
}

/** 支撑腿（放下触地态）：外管+内管+摇柄+脚盘；原点=车底挂点，向下伸出 drop。 */
export function createJackLeg(assets: SharedAssets, params: JackLegParams): THREE.Group {
  const { drop, name } = params;
  const group = new THREE.Group();
  group.name = `${name}/jack-leg`;

  const metalMaterial = toonMaterials.get('metal', { color: '#565b62', name: `${name}/jack-metal` });
  const padMaterial = toonMaterials.get('matteProp', { color: '#2e3033', outline: false, name: `${name}/jack-pad` });

  const outerLength = drop * 0.46;
  const innerLength = drop - outerLength; // 放下态：内管全伸出，脚盘底=−drop
  const tubeGeometry = assets.geometry(`${name}|tube`, () => {
    const outer = hardenEdges(new THREE.CylinderGeometry(0.05, 0.05, outerLength, 10));
    outer.translate(0, -outerLength / 2, 0);
    const inner = hardenEdges(new THREE.CylinderGeometry(0.03, 0.03, innerLength, 8));
    inner.translate(0, -outerLength - innerLength / 2, 0);
    const pad = hardenEdges(new THREE.CylinderGeometry(0.095, 0.075, 0.035, 12));
    pad.translate(0, -drop + 0.0175, 0); // 脚盘底面=−drop（触地基准）
    const merged = mergeGeometries([outer, inner, pad]);
    if (!merged) throw new Error(`[trailerRig/jackLeg] 支腿管柱合并失败：${name}`);
    return merged;
  });
  const tube = new THREE.Mesh(tubeGeometry, metalMaterial);
  tube.name = `${name}/jack-leg/tube`;
  tube.castShadow = true;
  group.add(tube);

  // 摇柄（侧向 L 柄，放下态收拢贴管）
  const crankGeometry = assets.geometry(`${name}|crank`, () => {
    const shaft = hardenEdges(new THREE.CylinderGeometry(0.012, 0.012, 0.09, 6));
    shaft.rotateZ(Math.PI / 2);
    shaft.translate(0.055, -drop * 0.24, 0);
    const grip = hardenEdges(new THREE.CylinderGeometry(0.014, 0.014, 0.07, 6));
    grip.translate(0.1, -drop * 0.24 + 0.035, 0);
    const merged = mergeGeometries([shaft, grip]);
    if (!merged) throw new Error(`[trailerRig/jackLeg] 摇柄合并失败：${name}`);
    return merged;
  });
  const crank = new THREE.Mesh(crankGeometry, metalMaterial);
  crank.name = `${name}/jack-leg/crank`;
  group.add(crank);

  // 挂座（车底盒）
  const mount = new THREE.Mesh(
    assets.geometry(`${name}|mount`, () => hardenEdges(roundedBox({ width: 0.16, height: 0.09, depth: 0.16, radius: 0.02 }))),
    padMaterial,
  );
  mount.name = `${name}/jack-leg/mount`;
  mount.position.y = 0.04;
  group.add(mount);
  return group;
}
