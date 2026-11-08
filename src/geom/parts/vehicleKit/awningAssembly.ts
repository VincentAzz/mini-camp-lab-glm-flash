// docs/01-整体架构.md §3.2 geom/parts/vehicleKit/awningAssembly.ts —— 部件库二批：侧遮阳棚整组。
// docs/03-车型模块.md §4.2.0 vehicleKit 表「awningAssembly：斜布+八字支撑臂+前垂缘」；
// 使用者：A 型 awningAssembly(4.2,1.9)（§4.2.2【3.2-5】）/ 拖挂 awningAssembly(3.2,1.7)（§4.2.3）/
//   B 型 awningAssembly(2.6,1.6)（§4.2.4）。
// 布面契约（docs/05 §7.1.2，与 clothMicro 同源）：PlaneGeometry 12×8 分段；固定边约定 uv.x=0
//   （wind.ts 定点说明）——本件固定边=靠车身侧（棚根），自由边=外缘（uv.x→1 摆幅最大）；
//   顶点位移归 WindSystem（车辆零布料代码，docs/01 §3.4 归属裁定），本件只出网格+句柄+静态预置斜面。
// 输出约定：整组局部原点在棚根（车身壁面）布面高度处；棚宽沿局部 X（车长向）、外伸沿局部 +Z
//   （调用方按车侧 rotateY 对位：左壁 +Z 直用、右壁 rotateY π）。
// ★ 禁止人形/人物几何（一.6）。
import * as THREE from 'three';
import type { ClothHandle, SharedAssets } from '@/systems/handles';
import { toonMaterials } from '@/render/toonMaterial';
import { hardenEdges, mergeGeometries } from '@/geom/primitives';
import { createPleatedBandGeometry } from './pleatedBand';

export interface AwningAssemblyParams {
  readonly assets: SharedAssets;
  /** 缓存/材质 name 前缀（同 id 几何共享；跨车同尺寸棚共享同一份斜布几何） */
  readonly id: string;
  /** 棚宽（沿车身 X 向展开长；A 4.2 / 拖挂 3.2 / B 2.6） */
  readonly width: number;
  /** 棚深（外伸量；A 1.9 / 拖挂 1.7 / B 1.6） */
  readonly drop: number;
  /** 布色（条纹底色） */
  readonly color: string;
  /** 条纹副色（缺省米白 #f6f1e4；A 型棚布=藏青×米白条纹） */
  readonly stripeColor?: string;
  /** 条纹数（缺省 10） */
  readonly stripes?: number;
  /** 斜布倾角 rad（缺省 12°≈0.209——A 型「斜布 12°」，draft 12 §4.2） */
  readonly slopeRad?: number;
  /** ClothHandle.stiffness（A/B/拖挂棚均 0.4，docs/03 §4.2 各车布料行） */
  readonly stiffness: number;
  /** ClothHandle.windFactor（车外棚布 1.0） */
  readonly windFactor?: number;
  /** ClothHandle.sagAmp（雨天积水下凹；docs/05 五-3：A·B 棚 0.05） */
  readonly sagAmp?: number;
  /** 支撑臂/卷管金属色（缺省深灰） */
  readonly armColor?: string;
}

export interface AwningAssemblyResult {
  /** 整组（斜布+卷管+八字支撑臂+前垂缘；DeploymentPart 'awning' node） */
  readonly group: THREE.Group;
  /** 斜布网格（ClothHandle.mesh；雪壳挂其下继承风摆与 sag——M4） */
  readonly clothMesh: THREE.Mesh;
  /** 布料句柄（WindSystem 统一驱动；车辆零布料代码） */
  readonly handle: ClothHandle;
}

/**
 * 侧遮阳棚整组：斜布（固定边在棚根、外缘按倾角下垂）+ 卷管 + 前横杆 + 八字斜撑臂 ×2 +
 * 前垂缘（褶带挂外缘）。斜布按 clothMicro 同款契约直建（12×8 分段 Plane 转平 + uv.x=0 固定边），
 * 静态预置形（倾角+自由边微垂）烘焙进顶点。
 */
export function createAwningAssembly(params: AwningAssemblyParams): AwningAssemblyResult {
  const { assets, id, width, drop } = params;
  const slope = params.slopeRad ?? 0.209; // 12°
  const group = new THREE.Group();
  group.name = `${id}/awning`;

  /* —— 斜布：PlaneGeometry(drop, width, 8, 12)，uv.x 0..1 沿外伸向 → 转平后外伸沿 +Z、棚宽沿 X —— */
  const clothGeometry = assets.geometry(`${id}/cloth|${width}|${drop}|${slope.toFixed(3)}`, () => {
    const plane = new THREE.PlaneGeometry(drop, width, 8, 12); // uv.x 0..1 = x −drop/2..+drop/2
    plane.rotateX(-Math.PI / 2); // 法线 +Z→+Y（转平）；外伸向沿 X、棚宽沿 Z
    plane.rotateY(-Math.PI / 2); // 外伸向 X→+Z、棚宽 Z→X；uv.x=0 固定边在 z=−drop/2
    plane.translate(0, 0, drop / 2); // 外伸 z 0..+drop，固定边 z=0（棚根）
    const position = plane.getAttribute('position') as THREE.BufferAttribute;
    const uv = plane.getAttribute('uv') as THREE.BufferAttribute;
    for (let i = 0; i < position.count; i++) {
      const u = uv.getX(i); // 0=棚根（固定边）→ 1=外缘（自由边）
      const z = position.getZ(i);
      position.setY(i, position.getY(i) - Math.sin(slope) * z - 0.05 * u * u); // 斜面 + 自由边微垂
    }
    position.needsUpdate = true;
    plane.computeVertexNormals();
    plane.computeBoundingSphere();
    return plane;
  });
  const edgeY = -Math.sin(slope) * drop - 0.05; // 自由边（u=1）布面高度（垂缘/横杆对位基准）

  /* —— 条纹贴图（Canvas，经 assets.texture 缓存；条纹沿棚宽向）—— */
  const stripes = params.stripes ?? 10;
  const stripeColor = params.stripeColor ?? '#f6f1e4';
  const texture = assets.texture(`${id}/tex-stripes`, () => {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error(`[vehicleKit/awning] 无法获取 2d 上下文 ${id}`);
    ctx.fillStyle = params.color;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = stripeColor;
    const band = canvas.width / stripes;
    for (let i = 0; i < stripes; i += 2) ctx.fillRect(i * band, 0, band, canvas.height);
    ctx.fillStyle = 'rgba(0,0,0,0.10)';
    for (let i = 0; i < 24; i++) ctx.fillRect(0, (i * canvas.height) / 24, canvas.width, 1); // 细纬线肌理
    const t = new THREE.CanvasTexture(canvas);
    t.name = `${id}/tex-stripes`;
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.ClampToEdgeWrapping;
    t.needsUpdate = true;
    return t;
  });
  texture.repeat.set(2, 1);

  const clothMaterial = toonMaterials.get('cloth', {
    color: params.color,
    map: texture,
    name: `${id}/cloth-mat`,
  });
  clothMaterial.side = THREE.DoubleSide; // 工厂无 side 参数——唯一 name 缓存键内设置（棚下仰视可见）
  const clothMesh = new THREE.Mesh(clothGeometry, clothMaterial);
  clothMesh.name = `${id}/cloth`;
  clothMesh.castShadow = true; // §4.3.3-⑤：棚布 castShadow（customDepthMaterial 由 WindSystem 注册时挂）
  clothMesh.receiveShadow = false;
  group.add(clothMesh);

  const handle: ClothHandle = {
    mesh: clothMesh,
    swayAxes: ['y', 'z'], // 固定边在棚根：自由边沿外伸 z 与竖直 y 摆（docs/05 §7.1.2 车棚行）
    stiffness: params.stiffness,
    windFactor: params.windFactor ?? 1,
    sagAmp: params.sagAmp ?? 0,
  };

  /* —— 架体：卷管（棚根）+ 前横杆 + 八字斜撑臂 ×2（单件合并=1 DC）—— */
  const armColor = params.armColor ?? '#4a4d52';
  const tubeR = 0.032;
  const frameGeometry = assets.geometry(`${id}/frame|${width}|${drop}|${slope.toFixed(3)}`, () => {
    const parts: THREE.BufferGeometry[] = [];
    // 卷管：沿棚宽 X，贴棚根
    const roller = new THREE.CylinderGeometry(tubeR, tubeR, width, 10);
    roller.rotateZ(Math.PI / 2); // 轴 Y → 轴 X
    roller.translate(0, -0.03, 0.09);
    parts.push(roller);
    // 前横杆：沿棚宽 X，在外缘布面下
    const bar = new THREE.CylinderGeometry(tubeR, tubeR, width, 10);
    bar.rotateZ(Math.PI / 2);
    bar.translate(0, edgeY - 0.02, drop * 0.86);
    parts.push(bar);
    for (const side of [-1, 1]) {
      // 八字斜撑臂：卷管下支点 → 前横杆端点（斜撑，两端各一）
      const fromY = -0.05;
      const toY = edgeY - 0.02;
      const fromZ = 0.12;
      const toZ = drop * 0.86;
      const len = Math.hypot(toY - fromY, toZ - fromZ);
      const arm = new THREE.CylinderGeometry(tubeR * 0.9, tubeR * 0.9, len, 8);
      arm.rotateX(Math.atan2(toZ - fromZ, toY - fromY)); // 轴 Y → YZ 面内斜向
      arm.translate(side * width * 0.46, (fromY + toY) / 2, (fromZ + toZ) / 2);
      parts.push(arm);
      // 外缘短吊带（前横杆端点 → 布缘，竖直 0.10）
      const link = new THREE.CylinderGeometry(tubeR * 0.7, tubeR * 0.7, 0.1, 6);
      link.translate(side * width * 0.46, edgeY - 0.07, drop * 0.885);
      parts.push(link);
    }
    const merged = mergeGeometries(parts);
    if (!merged) throw new Error(`[vehicleKit/awning] 棚架合并失败：${id}`);
    return hardenEdges(merged);
  });
  const armMaterial = toonMaterials.get('metal', { color: armColor, name: `${id}/arm` });
  const frame = new THREE.Mesh(frameGeometry, armMaterial);
  frame.name = `${id}/frame`;
  frame.castShadow = true;
  group.add(frame);

  /* —— 前垂缘：褶带挂外缘布下（ PleatedBand 宽沿 X、高沿 Y，直接对位）—— */
  const valanceGeometry = assets.geometry(`${id}/valance|${width}`, () =>
    createPleatedBandGeometry({ width: width * 0.98, height: 0.24, pleats: Math.max(6, Math.round(width * 3)), depth: 0.035 }));
  const valance = new THREE.Mesh(valanceGeometry, clothMaterial);
  valance.name = `${id}/valance`;
  valance.position.set(0, edgeY - 0.10, drop * 0.985); // 顶缘压布缘 0.02，垂下 0.22
  valance.castShadow = true;
  group.add(valance);

  return { group, clothMesh, handle };
}
