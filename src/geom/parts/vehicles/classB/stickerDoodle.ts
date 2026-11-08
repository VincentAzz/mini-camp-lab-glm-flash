// docs/01-整体架构.md §3.2 geom/parts/vehicles/classB/ —— T26 B型面包车专用部件：手绘贴纸 ×3。
// docs/03-车型模块.md §4.2.4「手绘贴纸 ×3（texStickerDoodle 切片，rng 固定槽位选 3）」+
//   draft 12-车型模块 §6.1「4 枚 texStickerDoodle 切片 Plane，外偏 0.012；rng 种子 'classB'
//   从 4 固定槽位选 3，贴右侧裙+尾门」。
// 贴纸=Plane+透明贴图（手绘涂鸦 Canvas 见 retroTextures.ts），贴面外偏 0.012、带 2~4° 手贴歪斜。
// ★ 禁止人形/人物几何（一.6）。
import * as THREE from 'three';
import { toonMaterials } from '@/render/toonMaterial';
import type { Rng } from '@/shared/rng';
import type { SharedAssets } from '@/systems/handles';
import type { StickerTextures } from './retroTextures';

export interface StickerSlot {
  /** 缓存/日志槽位名（right-skirt-a / right-skirt-b / tailgate-a / tailgate-b） */
  readonly tag: string;
  /** 贴纸尺寸（宽×高） */
  readonly width: number;
  readonly height: number;
}

export interface StickerDoodleParams {
  /** 几何缓存（贴纸 Plane 直建不经 assets；保留字段与同目录部件签名一致） */
  readonly assets?: SharedAssets;
  /** 缓存/日志 id */
  readonly id: string;
  /** 4 枚涂鸦贴图（retroTextures.createStickerTextures 产物） */
  readonly textures: StickerTextures;
  /** 随机源（种子 'classB' 由车型模块下发——同组合可复现） */
  readonly rng: Rng;
  /** 4 个固定槽位（draft：右侧裙 ×2 + 尾门 ×2） */
  readonly slots: readonly StickerSlot[];
}

export interface StickerDoodleResult {
  /** 贴纸合组（调用方按槽位位姿摆放单枚；见 placeSticker） */
  readonly group: THREE.Group;
  /** 每槽位一枚网格（顺序同 slots 中被选中的 3 个；挂到调用方指定父节点用） */
  readonly meshes: readonly THREE.Mesh[];
  /** 被选中的槽位 tag（诊断用） */
  readonly pickedTags: readonly string[];
}

/**
 * 手绘贴纸 ×3：4 枚涂鸦 × 4 固定槽位，rng 抽 3 槽位 + 3 涂鸦配对（确定性）。
 * 单枚网格为 Plane（贴图透明底），工厂只出网格与歪斜角；位姿由调用方摆（贴右裙/尾门面）。
 */
export function createStickerDoodles(params: StickerDoodleParams): StickerDoodleResult {
  const { id, textures, rng, slots } = params;
  if (slots.length !== 4) throw new Error(`[classB/sticker] 槽位须 4 个（draft 固定槽位），实得 ${slots.length}`);

  const doodles = [textures.wave, textures.sun, textures.cactus, textures.vanlife];

  // 固定槽位选 3：洗牌槽位索引取前 3（rng 确定性——同种子同结果）
  const order = [0, 1, 2, 3];
  for (let i = order.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    const tmp = order[i] ?? 0;
    order[i] = order[j] ?? 0;
    order[j] = tmp;
  }
  const picked = order.slice(0, 3);

  // 涂鸦配对同样洗牌取前 3（3 枚贴纸各不重样）
  const doodleOrder = [0, 1, 2, 3];
  for (let i = doodleOrder.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    const tmp = doodleOrder[i] ?? 0;
    doodleOrder[i] = doodleOrder[j] ?? 0;
    doodleOrder[j] = tmp;
  }

  const group = new THREE.Group();
  group.name = `${id}/stickers`;
  const meshes: THREE.Mesh[] = [];
  const pickedTags: string[] = [];
  picked.forEach((slotIndex, i) => {
    const slot = slots[slotIndex];
    if (!slot) throw new Error('[classB/sticker] 槽位越界');
    const doodle = doodles[doodleOrder[i] ?? 0];
    if (!doodle) throw new Error('[classB/sticker] 涂鸦越界');
    // 贴纸材质：cloth 原型带贴图（opacity<1 → 工厂自动 transparent）；每枚独立缓存键（贴图参与缓存键，天然互不串）
    const material = toonMaterials.get('cloth', {
      color: '#ffffff',
      map: doodle,
      opacity: 0.94,
      outline: false,
      name: `${id}/sticker-${slot.tag}`,
    });
    material.side = THREE.DoubleSide;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(slot.width, slot.height), material);
    mesh.name = `${id}/sticker/${slot.tag}`;
    mesh.userData.noOutline = true;
    mesh.renderOrder = 6; // 贴纸贴花层（本体 0 与玻璃 20 之间）
    // 手贴歪斜：2~4°（rng.range ±(0.035..0.07) rad——3.4-12「用过的样子」）
    mesh.rotation.z = rng.range(0.035, 0.07) * (rng.bool() ? 1 : -1);
    meshes.push(mesh);
    pickedTags.push(slot.tag);
    group.add(mesh);
  });

  return { group, meshes, pickedTags };
}
