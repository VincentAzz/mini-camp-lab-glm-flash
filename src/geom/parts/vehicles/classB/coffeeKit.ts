// docs/01-整体架构.md §3.2 geom/parts/vehicles/classB/ —— T26 B型面包车专用部件：手冲咖啡具。
// docs/03-车型模块.md §4.2.0 vehicleKit 表「coffeeKit」；§4.2.4 内饰清单「coffeeKit 手冲咖啡具
//   （壶+锥形滤杯+双杯，台面）」+ draft 12-车型模块 §6.3「coffeeKit()：壶+锥形滤杯+双杯」。
// 3.4-11 原文条目落点；Lathe 回转体（建模字典④）——壶身/滤杯/杯；鹅颈管 tube。
// ★ 禁止人形/人物几何（一.6）。
import * as THREE from 'three';
import type { SharedAssets } from '@/systems/handles';
import { toonMaterials } from '@/render/toonMaterial';
import { hardenEdges, lathe, tube } from '@/geom/primitives';

export interface CoffeeKitParams {
  readonly assets: SharedAssets;
  /** 缓存/日志 id */
  readonly id: string;
  /** 壶金属色（缺省奶油白瓷感） */
  readonly kettleColor?: string;
  /** 滤杯色（缺省青绿 #7fb5a3——3.4-12 软装色） */
  readonly dripperColor?: string;
  /** 工厂材质 name 前缀（缓存键） */
  readonly name: string;
}

/** 手冲咖啡具组：手冲壶+锥形滤杯（带滤纸沿）+分享壶+双杯；原点=台面接触点，壶在 −X 侧。 */
export function createCoffeeKit(params: CoffeeKitParams): THREE.Group {
  const { assets, id, name } = params;

  const group = new THREE.Group();
  group.name = `${id}/coffee-kit`;

  const metalMaterial = toonMaterials.get('metal', { color: params.kettleColor ?? '#d8d2c4', outline: false, name: `${name}/kettle` });
  const dripMaterial = toonMaterials.get('matteProp', { color: params.dripperColor ?? '#7fb5a3', name: `${name}/dripper` });
  const cupMaterial = toonMaterials.get('matteProp', { color: '#fff6e2', name: `${name}/cup` });
  const darkMaterial = toonMaterials.get('matteProp', { color: '#3a3d42', outline: false, name: `${name}/dark` });

  // —— 手冲壶（Lathe 葫芦身+鹅颈嘴 tube+把手）——
  const kettle = new THREE.Group();
  kettle.name = `${id}/kettle`;
  const kettleBody = new THREE.Mesh(
    assets.geometry(`${id}/kettle-body`, () =>
      hardenEdges(
        lathe({
          profile: [
            [0.001, 0],
            [0.05, 0.004],
            [0.062, 0.05],
            [0.05, 0.1],
            [0.052, 0.14],
            [0.03, 0.175],
            [0.034, 0.185],
            [0.026, 0.19],
          ],
          segments: 12,
        }),
      )),
    metalMaterial,
  );
  kettleBody.name = `${id}/kettle-body`;
  kettle.add(kettleBody);
  const spout = new THREE.Mesh(
    assets.geometry(`${id}/kettle-spout`, () =>
      tube({
        pointsOrCurve: [
          new THREE.Vector3(0.05, 0.12, 0),
          new THREE.Vector3(0.1, 0.17, 0),
          new THREE.Vector3(0.14, 0.22, 0),
          new THREE.Vector3(0.17, 0.235, 0),
        ],
        radius: 0.011,
        tubularSegments: 10,
      }),
    ),
    metalMaterial,
  );
  spout.name = `${id}/kettle-spout`;
  kettle.add(spout);
  const kettleHandle = new THREE.Mesh(
    assets.geometry(`${id}/kettle-handle`, () =>
      tube({
        pointsOrCurve: [
          new THREE.Vector3(-0.05, 0.16, 0),
          new THREE.Vector3(-0.09, 0.2, 0),
          new THREE.Vector3(-0.075, 0.26, 0),
          new THREE.Vector3(-0.03, 0.27, 0),
        ],
        radius: 0.008,
        tubularSegments: 8,
      }),
    ),
    darkMaterial,
  );
  kettleHandle.name = `${id}/kettle-handle`;
  kettle.add(kettleHandle);
  kettle.position.set(-0.16, 0, -0.05);
  group.add(kettle);

  // —— 锥形滤杯（Lathe 锥+滤纸沿+肋纹；架在分享壶口）——
  const dripper = new THREE.Mesh(
    assets.geometry(`${id}/dripper`, () =>
      hardenEdges(
        lathe({
          profile: [
            [0.075, 0.085],
            [0.078, 0.09],
            [0.05, 0.06],
            [0.03, 0.028],
            [0.012, 0.0],
            [0.012, -0.02],
            [0.03, -0.02],
            [0.04, -0.005],
            [0.055, 0.03],
            [0.07, 0.07],
          ],
          segments: 12,
        }),
      )),
    dripMaterial,
  );
  dripper.name = `${id}/dripper`;
  dripper.position.set(0.02, 0.115, 0.02);
  group.add(dripper);

  // —— 分享壶（玻璃感 lathe 杯身+木把手）——
  const server = new THREE.Mesh(
    assets.geometry(`${id}/server`, () =>
      hardenEdges(
        lathe({
          profile: [
            [0.001, 0],
            [0.055, 0.002],
            [0.06, 0.05],
            [0.05, 0.09],
            [0.045, 0.115],
            [0.05, 0.12],
            [0.048, 0.125],
          ],
          segments: 12,
        }),
      )),
    toonMaterials.get('glass', { color: '#cfe0d8', name: `${name}/server` }),
  );
  server.name = `${id}/server`;
  server.position.set(0.02, 0, 0.02);
  group.add(server);

  // —— 双杯（错位摆；杯柄 tube 弧）——
  const cupGeometry = assets.geometry(`${id}/cup`, () =>
    hardenEdges(
      lathe({
        profile: [
          [0.001, 0],
          [0.03, 0.002],
          [0.036, 0.045],
          [0.034, 0.05],
        ],
        segments: 10,
      }),
    ));
  const cupHandleGeometry = assets.geometry(`${id}/cup-handle`, () =>
    tube({
      pointsOrCurve: [
        new THREE.Vector3(0.032, 0.038, 0),
        new THREE.Vector3(0.05, 0.04, 0),
        new THREE.Vector3(0.046, 0.02, 0),
      ],
      radius: 0.005,
      tubularSegments: 6,
    }));
  for (const [x, z, rot] of [[0.14, -0.09, 0.5], [0.2, 0.06, -0.9]] as const) {
    const cup = new THREE.Mesh(cupGeometry, cupMaterial);
    cup.name = `${id}/cup/${x}/${z}`;
    cup.position.set(x, 0, z);
    cup.rotation.y = rot;
    const handle = new THREE.Mesh(cupHandleGeometry, cupMaterial);
    handle.name = `${id}/cup-handle/${x}/${z}`;
    handle.position.set(x, 0, z);
    handle.rotation.y = rot;
    group.add(cup, handle);
  }

  group.traverse((object) => {
    object.userData.noOutline = true; // 内饰小件 noOutline
  });
  return group;
}
