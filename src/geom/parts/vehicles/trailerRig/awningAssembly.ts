// docs/01-整体架构.md §3.2 geom/parts/vehicles/trailerRig/awningAssembly.ts —— T25 部件：遮阳棚整组。
// docs/03-车型模块.md §4.2.0 vehicleKit 表「awningAssembly（斜布+八字支撑臂+前垂缘）」+ §4.2.3 拖挂
//   「遮阳棚 awningAssembly(3.2,1.7) 右侧展开（ClothHandle+clothTop）」；draft 12-车型模块 §5.2 行。
// 本批随 T25 落于 trailerRig 部件子目录（vehicleKit 首批六件未含此件——A/B 型 T24/T26 复用时按各车
//   ask 指定目录处置，归 T28 合拢统一，openIssues 已登记）。
// 输出约定：组原点=棚在车身侧壁的挂点（壁缘中点）；斜布自挂点沿局部 −Z 外伸、沿局部 X 展开（span），
//   固定边=壁缘（uv.x=0）→ 自由边=外缘（uv.x=1）——WindSystem 布料补丁定点约定（wind.ts 顶注）。
//   布面 = PlaneGeometry(reach, span, 12, 8)（docs/05 §7.1.2 布料网格 12×8 分段契约）经矩阵烘焙整形。
// clothTop 雪壳挂布网格之下以继承风摆与 uSag（handles.ts WeatherSurface 注/docs/05 §4.4.2-M4）。
// 材质在部件内经工厂生成（同 vehicleKit 部件约定：工厂 name 缓存键唯一性由调用方 name 前缀保证）；
//   布材质 emissiveIntensity authored 0——拖挂棚布透光非 docs/03 §4.2.3 清单项，钩子不写（区别于 C 型帐帘带）。
// ★ 禁止人形/人物几何（一.6）。
import * as THREE from 'three';
import type { SharedAssets } from '@/systems/handles';
import { toonMaterials } from '@/render/toonMaterial';
import { hardenEdges, mergeGeometries, roundedBox } from '@/geom/primitives';
import { createPleatedBandGeometry } from '@/geom/parts/vehicleKit';

export interface AwningAssemblyParams {
  /** 展开宽（车身纵向 X；draft §5.2 定值 3.2） */
  readonly span: number;
  /** 外伸深（自壁缘；draft 定值 1.7） */
  readonly reach: number;
  /** 外缘下垂角 rad（斜布；0.23 ≈ 13°，外缘低于挂点 reach×sin） */
  readonly slope?: number;
  /** 垂缘高（前垂缘；缺省 0.16） */
  readonly valanceHeight?: number;
  /** 布色（缺省条纹布灰白） */
  readonly clothColor?: string;
  /** 布透明度（拖挂棚布不透内饰，缺省 1 不透明） */
  readonly clothOpacity?: number;
  /** 工厂材质/几何缓存键前缀（调用方保证唯一，如 'trailerRig/awning'） */
  readonly name: string;
}

export interface AwningAssemblyResult {
  /** 整组（布+臂+垂缘+壁轨；调用方摆位/旋转后加入 exterior） */
  readonly group: THREE.Group;
  /** 斜布网格（ClothHandle.mesh；12×8 分段 PlaneGeometry 烘焙，uv.x 固定边=壁缘） */
  readonly clothMesh: THREE.Mesh;
  /** 布顶雪壳（clothTop WeatherSurface.snowShell；挂布网格之下继承风摆/sag，visible=false 待注册驱动） */
  readonly snowShell: THREE.Mesh;
  /** 布材质单例（工厂缓存；authored emissiveIntensity 0，见文件头注） */
  readonly clothMaterial: THREE.MeshToonMaterial;
}

/** 两点间撑杆（八字臂段；quaternion 对轴，半径缺省 0.016）。 */
function strutBetween(a: THREE.Vector3, b: THREE.Vector3, radius = 0.016): THREE.BufferGeometry {
  const direction = b.clone().sub(a);
  const length = direction.length();
  const geometry = new THREE.CylinderGeometry(radius, radius, length, 8);
  geometry.translate(0, length / 2, 0); // 杆轴 +Y、原点在 a 端
  const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  geometry.applyQuaternion(quaternion);
  geometry.translate(a.x, a.y, a.z);
  return hardenEdges(geometry);
}

/** 遮阳棚整组：斜布（可注册布料）+ 八字支撑臂 ×2 + 前垂缘 + 壁轨；原点=壁缘挂点中点。 */
export function createAwningAssembly(assets: SharedAssets, params: AwningAssemblyParams): AwningAssemblyResult {
  const { span, reach, name } = params;
  const slope = params.slope ?? 0.23;
  const valanceHeight = params.valanceHeight ?? 0.16;
  const group = new THREE.Group();
  group.name = `${name}/awning`;

  const clothMaterial = toonMaterials.getToon('cloth', {
    color: params.clothColor ?? '#cfd4cf',
    opacity: params.clothOpacity ?? 1,
    outline: false,
    name: `${name}/cloth`,
  });
  clothMaterial.side = THREE.DoubleSide; // 布面烘焙后法线朝下（斜布顶面仰视/俯视均需可见；工厂无 side 参数——唯一 name 缓存键内改，同 classC band 做法）
  const trimMaterial = toonMaterials.get('matteProp', { color: '#8a9096', outline: false, name: `${name}/trim` });
  const snowMaterial = toonMaterials.get('matteProp', {
    color: '#edf2f9', snow: 'off', opacity: 0.999, name: `${name}/snow`,
  }); // 同 seacliff/classC 雪壳材质口径：WeatherMaterialSystem 注册期 patchShellExtrude 接管

  /* —— 斜布：PlaneGeometry(reach, span, 12, 8) 烘焙——uv.x 沿外伸向（壁缘 0 → 外缘 1），外缘下垂 slope —— */
  const clothGeometry = assets.geometry(`${name}|cloth`, () => {
    const geometry = new THREE.PlaneGeometry(reach, span, 12, 8); // u(x)=外伸向、v(y)=展向
    geometry.rotateY(Math.PI / 2); // u→−Z（外伸），v→Y（展向竖直），法线 +Z→+X
    geometry.translate(0, 0, -reach / 2); // 壁缘（uv.x=0）归到 z0：布自挂点向 −Z 全外伸 reach
    geometry.rotateZ(-Math.PI / 2); // 展向 Y→X（车身纵向），法线 +X→+Y（面朝上）
    geometry.rotateX(slope); // 外缘（−Z 侧）下垂：y' = −z·sin(slope) < 0
    return geometry;
  });

  /* —— 壁轨（挂点横杆）+ 八字支撑臂 ×2（外侧缘下拉至壁低位，侧面读作八字）+ 前垂缘（外缘垂边）—— */
  const parts: THREE.Mesh[] = [];
  const rail = new THREE.Mesh(
    assets.geometry(`${name}|rail`, () => hardenEdges(roundedBox({ width: span, height: 0.07, depth: 0.09, radius: 0.02 }))),
    trimMaterial,
  );
  rail.name = `${name}/awning/rail`;
  rail.position.set(0, -0.035, 0.045);
  parts.push(rail);

  const outerY = -reach * Math.sin(slope); // 布外缘挂高（组系）
  const outerZ = -reach * Math.cos(slope);
  const armGeometry = assets.geometry(`${name}|arm`, () => {
    const upper = strutBetween(new THREE.Vector3(0, -0.06, -0.02), new THREE.Vector3(0, outerY, outerZ + 0.1), 0.017);
    const bracket = strutBetween(new THREE.Vector3(0, -0.06, -0.02), new THREE.Vector3(0, -0.52, -0.05), 0.014);
    const merged = mergeGeometries([upper, bracket]);
    if (!merged) throw new Error(`[trailerRig/awning] 支撑臂合并失败：${name}`);
    return merged;
  });
  for (const x of [-span * 0.28, span * 0.28]) {
    const arm = new THREE.Mesh(armGeometry, trimMaterial);
    arm.name = `${name}/awning/arm/${x.toFixed(2)}`;
    arm.position.x = x;
    parts.push(arm);
  }

  const valance = new THREE.Mesh(
    assets.geometry(`${name}|valance`, () =>
      createPleatedBandGeometry({ width: span, height: valanceHeight, pleats: 9, depth: 0.045 })),
    trimMaterial,
  );
  valance.name = `${name}/awning/valance`;
  valance.position.set(0, outerY - valanceHeight / 2, outerZ);
  parts.push(valance);
  group.add(...parts);

  /* —— 雪壳（clothTop）：布几何同形克隆（+0.4% 外扩），挂布网格之下继承风摆/sag —— */
  const snowShellGeometry = assets.geometry(`${name}|cloth-snow`, () => {
    const geometry = new THREE.PlaneGeometry(reach, span, 12, 8);
    geometry.rotateY(Math.PI / 2);
    geometry.translate(0, 0, -reach / 2); // 与布同位（壁缘 z0 起）
    geometry.rotateZ(-Math.PI / 2);
    geometry.rotateX(slope);
    geometry.scale(1.004, 1.004, 1.004);
    return geometry;
  });
  const snowShell = new THREE.Mesh(snowShellGeometry, snowMaterial);
  snowShell.name = `${name}/awning/snow-shell`;
  snowShell.userData.noOutline = true;
  snowShell.visible = false; // WeatherMaterialSystem 注册后按 snowCover 驱动（docs/05 §4.4.2-M4）

  const clothMesh = new THREE.Mesh(clothGeometry, clothMaterial);
  clothMesh.name = `${name}/awning/cloth`;
  clothMesh.castShadow = true;
  clothMesh.add(snowShell);

  group.add(clothMesh);
  return { group, clothMesh, snowShell, clothMaterial };
}
