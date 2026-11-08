// docs/01-整体架构.md §3.2 geom/parts/servicearea/ —— 洗手池。
// docs/02-场景模块.md §4.1.4-⑪「洗手池（台+盆+弯管龙头+镜背板）」。
// ★ 禁止人形/人物几何（一.6）。T21 落点。
import * as THREE from 'three';
import type { SharedAssets } from '@/systems/handles';
import { toonMaterials } from '@/render/toonMaterial';
import { mergeGeometries, hardenEdges, roundedBox, lathe, tube } from '@/geom/primitives';

export interface WashBasinParams {
  readonly assets: SharedAssets;
  /** 缓存 id（'washBasin/servicearea'） */
  readonly id: string;
}

/** 洗手池：台体+盆（Lathe）+弯管龙头（Tube）+镜背板。原点=台底地面，正面朝 +z。 */
export function createWashBasin(params: WashBasinParams): THREE.Group {
  const { assets, id } = params;
  const group = new THREE.Group();
  group.name = id;

  const counterMaterial = toonMaterials.get('concrete', { color: '#a9adb2', name: `${id}/counter` });
  const counterGeometry = assets.geometry(`${id}/counter`, () => {
    const parts: THREE.BufferGeometry[] = [];
    const counter = roundedBox({ width: 0.78, height: 0.06, depth: 0.48, radius: 0.02 });
    counter.translate(0, 0.84, 0);
    parts.push(hardenEdges(counter));
    const leftLeg = roundedBox({ width: 0.07, height: 0.84, depth: 0.42, radius: 0.012 });
    leftLeg.translate(-0.33, 0.42, 0);
    parts.push(hardenEdges(leftLeg));
    const rightLeg = roundedBox({ width: 0.07, height: 0.84, depth: 0.42, radius: 0.012 });
    rightLeg.translate(0.33, 0.42, 0);
    parts.push(hardenEdges(rightLeg));
    const back = roundedBox({ width: 0.78, height: 0.1, depth: 0.05, radius: 0.012 });
    back.translate(0, 0.88, -0.2);
    parts.push(hardenEdges(back));
    const merged = mergeGeometries(parts);
    if (!merged) throw new Error(`[washBasin] 台体合并失败 ${id}`);
    return merged;
  });
  const counter = new THREE.Mesh(counterGeometry, counterMaterial);
  counter.name = `${id}/counter`;
  counter.castShadow = true;
  group.add(counter);

  // 盆（Lathe 浅碗，台面嵌入式）
  const basin = new THREE.Mesh(
    assets.geometry(`${id}/basin`, () =>
      lathe({
        profile: [
          [0.0, 0.0],
          [0.13, 0.0],
          [0.16, 0.045],
          [0.165, 0.09],
        ],
        segments: 14,
      }),
    ),
    toonMaterials.get('matteProp', { color: '#eef0f2', name: `${id}/basin` }),
  );
  basin.name = `${id}/basin`;
  basin.position.set(0, 0.855, 0.02);
  group.add(basin);

  // 弯管龙头（Tube 上行+弯头+下嘴）
  const faucet = new THREE.Mesh(
    assets.geometry(`${id}/faucet`, () =>
      tube({
        pointsOrCurve: [
          new THREE.Vector3(0, 0.88, -0.14),
          new THREE.Vector3(0, 1.0, -0.14),
          new THREE.Vector3(0, 1.06, -0.06),
          new THREE.Vector3(0, 1.0, 0.02),
        ],
        radius: 0.016,
        tubularSegments: 14,
        radialSegments: 6,
      }),
    ),
    toonMaterials.get('metal', { color: '#5f666e', name: `${id}/faucet` }),
  );
  faucet.name = `${id}/faucet`;
  group.add(faucet);

  // 镜背板（淡青「镜面」板，微反光 metal 原型）
  const mirror = new THREE.Mesh(
    assets.geometry(`${id}/mirror`, () => hardenEdges(roundedBox({ width: 0.56, height: 0.52, depth: 0.03, radius: 0.02 }))),
    toonMaterials.get('metal', { color: '#9fc3cc', specBand: { threshold: 0.8, intensity: 0.4, color: '#dfeef2' }, name: `${id}/mirror` }),
  );
  mirror.name = `${id}/mirror`;
  mirror.position.set(0, 1.22, -0.24);
  mirror.rotation.x = -0.06;
  mirror.castShadow = true;
  group.add(mirror);
  const mirrorFrame = new THREE.Mesh(
    assets.geometry(`${id}/mirror-frame`, () =>
      hardenEdges(roundedBox({ width: 0.6, height: 0.56, depth: 0.02, radius: 0.02 })),
    ),
    counterMaterial,
  );
  mirrorFrame.name = `${id}/mirror-frame`;
  mirrorFrame.position.set(0, 1.22, -0.258);
  group.add(mirrorFrame);

  return group;
}
