// _drill_testrig.ts —— T28 扩展演练临时车型（docs/08 T28「临时测试车型注册/卸除演练」；T22 场景演练同款流程）。
// 生命周期：随 test 提交入库 → git revert 由版本管理移除（非手工删除，遵守安全红线）；
//   可自 test 提交 hash 恢复。用途：验证「新增车型 = 一新文件 + registry 一行注册，src/core 零改动」。
import * as THREE from 'three';
import type {
  DeploymentPart,
  InteriorLightHooks,
  VehicleBuildContext,
  VehicleExterior,
  VehicleInterior,
  VehicleModule,
} from '@/content/vehicles/types';

/** 演练车：最小四项完整（一辆素色厢车，无窗无布无灯点——仅验证注册/装配/卸除通路）。 */
export const testrigVehicle: VehicleModule = {
  id: 'testrig',
  label: '演练试验车',

  buildExterior(_ctx: VehicleBuildContext): VehicleExterior {
    const group = new THREE.Group();
    group.name = 'testrig/exterior';
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(4.4, 2.2, 2.0),
      new THREE.MeshToonMaterial({ color: '#cccccc' }),
    );
    body.position.y = 1.4;
    body.name = 'testrig/exterior/body';
    group.add(body);
    return {
      group,
      footprint: { length: 4.4, width: 2.0, track: 1.7, height: 2.5 },
      paint: { baseColor: '#cccccc', weathering: false },
      windows: [],
      cloths: [],
    };
  },

  buildDeployment(_ctx: VehicleBuildContext): readonly DeploymentPart[] {
    return []; // 演练车无展开机构
  },

  buildInterior(_ctx: VehicleBuildContext): VehicleInterior {
    const group = new THREE.Group();
    group.name = 'testrig/interior';
    const pad = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.08, 1.6), new THREE.MeshToonMaterial({ color: '#8a7a66' }));
    pad.position.y = 0.6;
    pad.name = 'testrig/interior/floorPad';
    group.add(pad);
    return { group, named: { floorPad: pad } };
  },

  interiorLightHooks: {
    lamps: [],
    applyInteriorLight(_power: number, _emphasis: number, _blend: number): void {
      // 演练车无灯点：钩子模板占位（D2 唯一下发入口仍按契约交出）
    },
  } satisfies InteriorLightHooks,
};
