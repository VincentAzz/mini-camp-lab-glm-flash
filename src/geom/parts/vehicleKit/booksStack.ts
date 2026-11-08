// docs/01-整体架构.md §3.2 geom/parts/vehicleKit/booksStack.ts —— 部件库首批：书册堆。
// docs/03-车型模块.md §4.2.0 vehicleKit 表「booksStack(n)：InstancedMesh 薄盒 ×n，随机转角与色相
//   （种子取车辆 id）」；C 型 9 册（§4.2.1 named `books`）/ B 型散书（T26 复用）。
// 实例化走 InstancedGroup（§5.6 同类 ≥3 必实例化；instanceColor 只做个体色相/明度微差）。
// ★ 禁止人形/人物几何（一.6）。
import * as THREE from 'three';
import { toonMaterials } from '@/render/toonMaterial';
import { roundedBox } from '@/geom/primitives';
import { InstancedGroup } from '@/geom/instanced';
import type { Rng } from '@/shared/rng';

export interface BooksStackParams {
  /** 册数（C 型 9） */
  readonly count: number;
  /** 随机源（转角/错位/色相索引；种子取车辆 id——由调用方传入已 fork 的 Rng） */
  readonly rng: Rng;
  /** 单册尺寸（缺省 0.16×0.026×0.115） */
  readonly bookSize?: readonly [number, number, number];
  /** 书脊色板（缺省旅居暖调 8 色） */
  readonly palette?: readonly string[];
  /** 工厂材质 name（缓存键） */
  readonly name: string;
}

/** 书册堆组：n 册薄盒竖叠 + 末册斜靠（「架上书册」读法），原点在堆底中心。 */
export function createBooksStack(params: BooksStackParams): THREE.Group {
  const { count, rng, name } = params;
  const [bw, bt, bd] = params.bookSize ?? [0.16, 0.026, 0.115];
  const palette = params.palette ?? ['#c2564a', '#4f8f8b', '#e8975a', '#6a8aa8', '#8a6a48', '#d9b98c', '#fff1dd', '#7a5236'];

  const group = new THREE.Group();
  group.name = `${name}/stack`;
  const geometry = roundedBox({ width: bw, height: bt, depth: bd, radius: 0.004 });
  const material = toonMaterials.get('matteProp', { color: '#d9b98c', outline: false, name: `${name}/book` });
  const books = new InstancedGroup(geometry, material, { capacity: count, name: `${name}/books` });
  const matrix = new THREE.Matrix4();
  const euler = new THREE.Euler();
  const quaternion = new THREE.Quaternion();
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3(1, 1, 1);
  for (let i = 0; i < count; i++) {
    const isLast = i === count - 1 && count >= 3;
    const lean = isLast ? 0.16 + rng.next() * 0.06 : 0; // 末册斜靠（「散落的书」读法）
    euler.set(0, rng.range(-0.14, 0.14), lean);
    quaternion.setFromEuler(euler);
    position.set(
      rng.range(-0.012, 0.012) + Math.sin(lean) * bt * 0.5,
      bt * (i + 0.5) * 1.04 + Math.sin(lean) * bw * 0.18,
      rng.range(-0.01, 0.01),
    );
    matrix.compose(position, quaternion, scale);
    const color = palette[Math.floor(rng.next() * palette.length)] ?? '#d9b98c';
    books.add(matrix, color);
  }
  books.group.userData.noOutline = true; // 小件 noOutline（透窗防描边碎线，docs/03 §4.2.0）
  group.add(books.group);
  return group;
}
