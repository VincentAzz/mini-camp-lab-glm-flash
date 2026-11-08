// 【T22 扩展演练·临时场景】lakeside 湖畔 —— 本文件为 T22「新增场景零核心改动」验证而临时创建，
// 将随演练提交一并被 git revert 撤销（用版本管理撤销，绝不直接删除文件）；文件名前缀 _drill_
// 标记其临时身份。若 revert 后本文件仍在工作区，说明撤销失败，须立即上报而非手工删除。
//
// 演练口径（TASKS.md T22 / docs/02 2.5「新增场景」验收路径）：
//   1. 新增最小 SceneModule（五部分齐备，契约同 docs/01 §3.3.2）；
//   2. 仅改 src/content/scenes/registry.ts 追加一行注册（★ 注册行替换点）——零 src/core/ 改动；
//   3. `pnpm exec tsc --noEmit` 通过即视为注册链类型闭合（UI 分段按钮按 Registry.list() 顺序
//      渲染，P6 T35 落地后自动出现，无需 UI 侧改动——docs/01 §3.1-④）。
// campAnchor 为演练假值（§4.1.0 无湖畔行）：position (0,0,0)/heading 0/groundY 0/radius 4.0。
import * as THREE from 'three';
import { toonMaterials } from '@/render/toonMaterial';
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

function buildTerrain(ctx: SceneBuildContext): SceneTerrain {
  const group = new THREE.Group();
  group.name = 'drill-lakeside/terrain';
  const plate = new THREE.Mesh(
    ctx.assets.geometry('drill-lakeside/plate', () => new THREE.BoxGeometry(13, 0.2, 13)),
    toonMaterials.get('groundTerrain', { color: '#7fa85c', name: 'drill-lakeside/plate' }),
  );
  plate.position.y = -0.1;
  plate.receiveShadow = true;
  group.add(plate);
  return {
    group,
    campAnchor: {
      position: new THREE.Vector3(0, 0, 0),
      headingRad: 0,
      groundY: 0,
      radius: 4.0,
    },
  };
}

function buildProps(_ctx: SceneBuildContext): SceneProps {
  const group = new THREE.Group();
  group.name = 'drill-lakeside/props';
  return { group, named: {}, cloths: [], lamps: [], emitters: [], weatherSurfaces: [] };
}

function createAnimations(_runtime: SceneRuntime): readonly SceneAnimation[] {
  return [];
}

const palette: ScenePalette = {
  colorChannels: { ground: '#7fa85c', water: '#4a8fa8' },
  baseStyle: {
    topTheme: 'lawn',
    edgeMatId: 'rockStrata',
    rimDecal: null,
    skirtLayers: 0,
    silhouette: null,
  },
  baseFog: 0.05,
};

const lightHooks: SceneLightHooks = {
  applyLighting(_state: SceneLightState, _blend: number): void {
    // 演练场景无具名装饰物状态：空实现即验证 lightHooks 契约接入（docs/01 §3.3.2 ⑤）
  },
};

/** T22 扩展演练临时场景（id 'lakeside' 不占用任何正式场景槽位；非默认）。 */
export const lakesideDrillScene: SceneModule = {
  id: 'lakeside',
  label: '湖畔（T22 演练临时）',
  buildTerrain,
  buildProps,
  createAnimations,
  palette,
  lightHooks,
};
