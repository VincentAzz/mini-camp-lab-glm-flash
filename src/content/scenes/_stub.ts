// 临时桩场景（T17 编排验证用）——★ 待清理项：正式场景（T18–T21）完成后，由其实现者替换
// content/scenes/registry.ts 中本文件的注册行，本文件保留至 T48 收尾统一处置（九.4：只登记不删除）。
//
// 覆盖面（「仅最小几何，供编排验证」）：
//   - SceneModule 五部分全实现（terrain/props/createAnimations/palette/lightHooks）；
//   - campAnchor 取 docs/02 §4.1.0 海崖行定值（position (0,0,0.8) / heading +0.30 / groundY 0 / radius 4.0）；
//   - 四类句柄各给最小样本，让 Director 的注册/反注册链真实走通：
//     cloth ×1（Wind 克隆+顶点位移链）、lamp ×1（Breath 'lamp' 通道）、emitter ×1（dust，P1 句柄）、
//     weatherSurface ×1（ground——工厂 groundTerrain 原生 wet/snow 反应面）；
//   - id 用 'seacliff'（默认场景槽位替身）：替换注册行后 id 不变，applyState 的 isDefault 读取无缝衔接。
import * as THREE from 'three';
import { toonMaterials } from '@/render/toonMaterial';
import type { Rng } from '@/shared/rng';
import type {
  SceneAnimation,
  SceneBuildContext,
  SceneLightHooks,
  SceneLightState,
  SceneModule,
  ScenePalette,
  SceneProps,
  SceneRuntime,
  SceneTerrain,
} from '@/content/scenes/types';
import type { LampHandle } from '@/systems/handles';

/* —— 地形：一块接收阴影的平整台面 + 海崖行 campAnchor —— */

function buildTerrain(ctx: SceneBuildContext): SceneTerrain {
  const group = new THREE.Group();
  group.name = 'stub/terrain';

  const geometry = ctx.assets.geometry('stub/terrain-plate', () => new THREE.BoxGeometry(13, 0.2, 13));
  const material = toonMaterials.get('groundTerrain', { color: '#86b05c', name: 'stub/terrain' });
  const plate = new THREE.Mesh(geometry, material);
  plate.name = 'stub/terrain-plate';
  plate.position.y = -0.1; // 台面顶 = y 0（统一底座台面同高）
  plate.receiveShadow = true;
  group.add(plate);

  return {
    group,
    // docs/02 §4.1.0 海崖行（占位替身用同一契约值）
    campAnchor: {
      position: new THREE.Vector3(0, 0, 0.8),
      headingRad: 0.3,
      groundY: 0,
      radius: 4.0,
    },
  };
}

/* —— 道具：营地灯（杆+灯体，'lamp' 通道）+ 小旗布料（Wind 链）+ 一路微尘发射器 —— */

function buildProps(ctx: SceneBuildContext): SceneProps {
  const group = new THREE.Group();
  group.name = 'stub/props';
  const rng: Rng = ctx.rng;

  // —— 营地灯：LampHandle（MeshToonMaterial+emissive；正式模块走工厂 emissive 通道，见 openIssues）
  const lampMat = new THREE.MeshToonMaterial({
    color: '#4a4034',
    emissive: '#ffc27d',
    emissiveIntensity: 0,
  });
  lampMat.name = 'stub/lamp';
  const lampBody = new THREE.Mesh(ctx.assets.geometry('stub/lamp-body', () => new THREE.BoxGeometry(0.22, 0.3, 0.22)), lampMat);
  lampBody.name = 'stub/lamp-body';
  const pole = new THREE.Mesh(
    ctx.assets.geometry('stub/lamp-pole', () => new THREE.CylinderGeometry(0.03, 0.035, 1.3, 8)),
    toonMaterials.get('metal', { color: '#5a5f66', name: 'stub/pole' }),
  );
  pole.name = 'stub/lamp-pole';
  pole.position.y = 0.65;
  lampBody.position.y = 1.36;
  const lampAnchor = new THREE.Group();
  lampAnchor.name = 'stub/lamp';
  lampAnchor.add(pole, lampBody);
  lampAnchor.position.set(-2.4, 0, 2.2 + rng.range(-0.1, 0.1));
  group.add(lampAnchor);

  const lamp: LampHandle = {
    emissiveMat: lampMat,
    mode: 'steady',
    params: {},
  };

  // —— 小旗：ClothHandle（Plane 12×8 分段，固定边 uv.x=0；顶点位移归 WindSystem，场景零代码）
  const flagMat = toonMaterials.get('cloth', { color: '#d9662e', name: 'stub/flag' });
  const flagMesh = new THREE.Mesh(
    ctx.assets.geometry('stub/flag-cloth', () => new THREE.PlaneGeometry(0.6, 0.4, 12, 8)),
    flagMat,
  );
  flagMesh.name = 'stub/flag';
  flagMesh.position.set(0.3, 1.55, 0);
  flagMesh.castShadow = true;
  const flagPole = new THREE.Mesh(
    ctx.assets.geometry('stub/flag-pole', () => new THREE.CylinderGeometry(0.022, 0.026, 1.7, 8)),
    toonMaterials.get('wood', { color: '#8a6a48', name: 'stub/flag-pole' }),
  );
  flagPole.name = 'stub/flag-pole';
  flagPole.position.y = 0.85;
  const flagAnchor = new THREE.Group();
  flagAnchor.name = 'stub/flag-anchor';
  flagAnchor.add(flagPole, flagMesh);
  flagAnchor.position.set(2.4, 0, 2.0);
  group.add(flagAnchor);

  // —— 微尘：EmitterSpec（P1：Director 注册后拿 setRate 句柄，随 SceneAnimation 生命周期释放）
  const emitters = [
    {
      kind: 'dust' as const,
      area: new THREE.Vector3(6, 2.2, 6),
      rate: 2.5,
      lifetime: 9,
      size0: 0.02,
      size1: 0.06,
      vel0: new THREE.Vector3(0, 0.03, 0),
      color: '#d8e2c8',
      opacity: 0.2,
      additive: false,
    },
  ];

  return {
    group,
    named: { lamp: lampAnchor, flag: flagAnchor },
    cloths: [{ mesh: flagMesh, swayAxes: ['z'], stiffness: 0.6 }],
    lamps: [lamp],
    emitters,
    // 台面=ground 作用面（同参数工厂命中与 buildTerrain 同一缓存材质；原生 uWet/uSnow 反应面，§5.2）
    weatherSurfaces: [
      {
        material: toonMaterials.get('groundTerrain', { color: '#86b05c', name: 'stub/terrain' }),
        kind: 'ground',
      },
    ],
  };
}

/* —— 动效：桩场景无数值动效（正式场景的 7 项动效落 T18–T21）；返回空表即验证 Director 的
 * SceneAnimation 帧驱动/dispose 循环对空集安全 —— */

function createAnimations(_runtime: SceneRuntime): readonly SceneAnimation[] {
  return [];
}

/* —— palette / lightHooks —— */

const palette: ScenePalette = {
  colorChannels: {
    ground: '#86b05c',
    rock: '#9a8672',
    sea: '#4a7fa8',
    foliage: '#5c8a4a',
  },
  baseStyle: {
    topTheme: 'lawn',
    edgeMatId: 'rockStrata',
    rimDecal: null,
    skirtLayers: 0,
    silhouette: 'coast',
  },
  baseFog: 0.1,
};

const lightHooks: SceneLightHooks = {
  applyLighting(_state: SceneLightState, _blend: number): void {
    // 桩场景无具名装饰物状态：灯点功率经 LightBreath 'lamp' 通道自动下发，无需场景侧翻译
  },
};

/** 临时桩场景（id 占用默认场景槽位 'seacliff'；isDefault 供 applyState 读取）。 */
export const stubScene: SceneModule = {
  id: 'seacliff',
  label: '海崖（占位桩）',
  isDefault: true,
  buildTerrain,
  buildProps,
  createAnimations,
  palette,
  lightHooks,
};
