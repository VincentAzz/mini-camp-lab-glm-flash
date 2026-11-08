// 临时桩车型（T17 编排验证用）——★ 待清理项：正式车型（T23–T27）完成后，由其实现者替换
// content/vehicles/registry.ts 中本文件的注册行，本文件保留至 T48 收尾统一处置（九.4：只登记不删除）。
//
// 覆盖面（「仅最小几何，供编排验证」）：
//   - VehicleModule 四项全实现（exterior/deployment/interior/interiorLightHooks）；
//   - footprint 取 C 型契约尺寸 6.4×2.6（docs/03 §4.2.1；外接半径 ≈3.45 < 营位 4.0 → 不触发越界告警，
//     告警通路由 Director.applyCampPlacement 承担、实机换大车验证）；
//   - 对位「轻微适配」消费 ctx.camp（groundY/headingRad 由 Director 下发，本桩只做接地）；
//   - 内饰灯 ×1（breath，'interior' 通道——决策 D2：全局编排经 LightBreath 下发，模块不读时间）；
//   - id 用 'classC'（默认车型槽位替身）：替换注册行后 id 不变，isDefault 读取无缝衔接。
import * as THREE from 'three';
import { toonMaterials } from '@/render/toonMaterial';
import type { Rng } from '@/shared/rng';
import type {
  DeploymentPart,
  InteriorLightHooks,
  VehicleBuildContext,
  VehicleExterior,
  VehicleInterior,
  VehicleModule,
} from '@/content/vehicles/types';
import type { LampHandle } from '@/systems/handles';

/* —— ① 外部模型：最小厢体 + 凸头 + 4 轮 + 前挡玻璃（+X=车头） —— */

function buildExterior(ctx: VehicleBuildContext): VehicleExterior {
  const group = new THREE.Group();
  group.name = 'stub/vehicle-exterior';
  const rng: Rng = ctx.rng;

  // 车身（接地：轮胎外缘最低点=局部 y0 → 轮半径 0.34，车底 ≈0.5）
  const body = new THREE.Mesh(
    ctx.assets.geometry('stub/vehicle-body', () => new THREE.BoxGeometry(4.4, 1.4, 2.2)),
    toonMaterials.get('paintCar', { color: '#f3ead8', name: 'stub/body' }),
  );
  body.name = 'stub/body';
  body.position.set(-0.4, 1.2, 0);
  body.castShadow = true;
  const cab = new THREE.Mesh(
    ctx.assets.geometry('stub/vehicle-cab', () => new THREE.BoxGeometry(1.1, 0.8, 2.0)),
    toonMaterials.get('paintCar', { color: '#f3ead8', name: 'stub/cab' }),
  );
  cab.name = 'stub/cab';
  cab.position.set(1.85, 2.3, 0);
  cab.castShadow = true;
  group.add(body, cab);

  // 轮组 ×4（Cylinder 轴 Y→rotateX 后轴向 Z=左右向）
  const wheelGeometry = ctx.assets.geometry('stub/vehicle-wheel', () => {
    const geo = new THREE.CylinderGeometry(0.34, 0.34, 0.24, 12);
    geo.rotateX(Math.PI / 2);
    return geo;
  });
  const wheelMaterial = toonMaterials.get('matteProp', { color: '#2e3033', name: 'stub/wheel' });
  for (const x of [1.55, -1.55]) {
    for (const z of [1.05, -1.05]) {
      const wheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
      wheel.name = `stub/wheel/${x}/${z}`;
      wheel.position.set(x + rng.range(-0.01, 0.01), 0.34, z);
      wheel.castShadow = true;
      group.add(wheel);
    }
  }

  // 前挡弧玻璃（玻璃卡通材质：transparent + depthWrite false，§5.2）
  const windshield = new THREE.Mesh(
    ctx.assets.geometry('stub/vehicle-windshield', () => new THREE.PlaneGeometry(1.7, 0.6)),
    toonMaterials.get('glass', { color: '#bcd8e8', name: 'stub/windshield' }),
  );
  windshield.name = 'stub/windshield';
  windshield.position.set(2.405, 2.32, 0);
  windshield.rotation.y = Math.PI / 2; // 面朝 +X（车头）
  group.add(windshield);

  return {
    group,
    // C 型契约尺寸（docs/03 §4.2.1；长度 +X、宽 Z）
    footprint: { length: 6.4, width: 2.6, track: 2.1, height: 2.8 },
    paint: { baseColor: '#f3ead8' },
    windows: [{ mesh: windshield, tint: 'tinted', label: 'front' }],
    cloths: [],
  };
}

/* —— ② 展开机构：桩给一个「踏步已放下」最小件（默认已展开交付） —— */

function buildDeployment(ctx: VehicleBuildContext): readonly DeploymentPart[] {
  const step = new THREE.Mesh(
    ctx.assets.geometry('stub/vehicle-step', () => new THREE.BoxGeometry(0.5, 0.06, 0.5)),
    toonMaterials.get('metal', { color: '#6a6f76', name: 'stub/step' }),
  );
  step.name = 'stub/step';
  step.position.set(-2.45, 0.45, 0);
  step.castShadow = true;
  if (!step.parent) ctx.root.add(step);
  return [{ node: step, kind: 'step', deployAmount: 1 }];
}

/* —— ③ 透视内饰：内壳（noOutline）+ 床台 + 小夜灯（breath，'interior' 通道） —— */

// 小夜灯材质：工厂 emissive 通道 toon（走 ramp 渐变；LightBreath 经 'interior' 通道驱动
// emissiveIntensity，7-1-⑥ 呼吸落点）。工厂「同原型+同参数命中缓存」天然保证模块级单例，
// LampHandle 注册/反注册幂等所需；材质实例归工厂管理（disposeAll 仅整体销毁时调用）。
const nightLampMaterial = toonMaterials.getToon('matteProp', {
  color: '#4a4034',
  emissive: '#ffce8a',
  emissiveIntensity: 0,
  name: 'stub/night-lamp',
});

function buildInterior(ctx: VehicleBuildContext): VehicleInterior {
  const group = new THREE.Group();
  group.name = 'stub/vehicle-interior';
  group.userData.noOutline = true; // 内饰子树整体跳过描边（§5.3）

  const innerShell = new THREE.Mesh(
    ctx.assets.geometry('stub/vehicle-inner-shell', () => new THREE.BoxGeometry(4.2, 1.3, 2.0)),
    toonMaterials.get('matteProp', { color: '#6b5a44', name: 'stub/inner-shell', outline: false }),
  );
  innerShell.name = 'stub/inner-shell';
  innerShell.position.set(-0.4, 1.2, 0);
  const bed = new THREE.Mesh(
    ctx.assets.geometry('stub/vehicle-bed', () => new THREE.BoxGeometry(1.6, 0.28, 1.5)),
    toonMaterials.get('cloth', { color: '#c9b8a0', name: 'stub/bed' }),
  );
  bed.name = 'stub/bed';
  bed.position.set(-1.6, 1.0, 0);
  group.add(innerShell, bed);

  const nightLamp = new THREE.Mesh(
    ctx.assets.geometry('stub/vehicle-night-lamp', () => new THREE.BoxGeometry(0.12, 0.12, 0.12)),
    nightLampMaterial,
  );
  nightLamp.name = 'stub/night-lamp';
  nightLamp.position.set(0.6, 1.75, 0.85);
  group.add(nightLamp);

  return {
    group,
    named: { innerShell, bed, nightLamp },
  };
}

/* —— ④ 内饰灯光钩子：lamps 交 LightBreath（'interior' 通道），D2：模块不读时间 —— */

const interiorLightHooks: InteriorLightHooks = {
  lamps: [
    {
      emissiveMat: nightLampMaterial,
      mode: 'breath',
      params: { period: 6, depth: 0.18 },
    } satisfies LampHandle,
  ],
  applyInteriorLight(power: number, emphasis: number, blend: number): void {
    // 灯点功率由 LightBreath 'interior' 通道自动下发；emphasis 留给正式模块的暖光强调（四-4）
    void power;
    void emphasis;
    void blend;
  },
};

/** 临时桩车型（id 占用默认车型槽位 'classC'；isDefault 供 applyState 读取）。 */
export const stubVehicle: VehicleModule = {
  id: 'classC',
  label: 'C型房车（占位桩）',
  isDefault: true,
  buildExterior,
  buildDeployment,
  buildInterior,
  interiorLightHooks,
};
