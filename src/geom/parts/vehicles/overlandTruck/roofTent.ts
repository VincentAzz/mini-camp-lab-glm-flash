// docs/01-整体架构.md §3.2 geom/parts/vehicles/overlandTruck/ —— T27 越野皮卡专用部件：车顶帐篷（RTT，已展开）。
// docs/03-车型模块.md §4.2.5「RTT 开启态：基座盒(1.5,0.22,1.25)+上壳斜撑 −165°（形成 12° 顶）+
//   下壳水平外伸 1.35（双壳铰链翻开）+三面褶皱侧布 pleatedBand+前端防雨檐（帐篷顶布 ClothHandle 0.8+clothTop）」；
// draft 12-车型模块 §7.1/§7.2（五车唯一双壳铰链上翻机构）。
// 输出约定：tent 组局部原点=铰链点（基座后缘/行李架台面高度）——基座沿局部 +X 前伸（朝车头），
//   下壳沿 −X 水平外伸；上壳组绕局部 Z 上翻 swing=180°−顶角（draft −165° 的等价正角），翻开后沿 −X
//   斜撑成 12° 顶、覆盖下壳外伸段（顶棚外端抬向登车口，入位净高随外伸增大——硬壳 RTT 展开读法）。
// 帐布（左右侧布+后幅+顶布）merge 成单一网格=单一 ClothHandle（同 C 型帐帘带做法，§4.2.1）；
//   侧布顶缘随 12° 顶斜（自定 slanted 褶皱条带；uv.x=0 为固定边=顶棚缝合边，wind.ts 定点约定）。
// ★ 禁止人形/人物几何（一.6）。
import * as THREE from 'three';
import type { SharedAssets } from '@/systems/handles';
import { toonMaterials } from '@/render/toonMaterial';
import { hardenEdges, mergeGeometries, roundedBox } from '@/geom/primitives';

export interface RoofTentParams {
  /** 基座长（沿 +X；1.5） */
  readonly baseLength?: number;
  /** 基座高（0.22） */
  readonly baseHeight?: number;
  /** 基座宽（Z 向；1.25） */
  readonly baseWidth?: number;
  /** 下壳水平外伸（1.35） */
  readonly extension?: number;
  /** 展开顶角（deg，上壳斜撑与水平夹角；12——draft 定值） */
  readonly roofAngleDeg?: number;
  /** 褶皱侧布褶数（每侧 6） */
  readonly pleats?: number;
  /** 材质/几何 name 前缀（缓存键） */
  readonly name?: string;
}

export interface RoofTentResult {
  /** RTT 整组（基座+上壳+下壳+帐布+防雨檐+撑腿）——DeploymentPart kind 'roofTent' node */
  readonly group: THREE.Group;
  /** 帐布单网格（左右侧布+后幅+顶布合并）——ClothHandle + WeatherSurface clothTop 用 */
  readonly fabricMesh: THREE.Mesh;
  /** 帐布材质（cloth toon，emissive authored 0 由内饰灯钩子写透光 0.55×power） */
  readonly fabricMaterial: THREE.MeshToonMaterial;
  /** 壳体材质（基座/上壳/下壳共用；roofTop 注册用） */
  readonly shellMaterial: THREE.Material;
  /** 上壳组（含顶布随动）——调用方可在其下挂雪壳子件以继承 12° 倾角 */
  readonly topShellGroup: THREE.Group;
  /** 实际顶角（rad） */
  readonly roofAngleRad: number;
  /** 下壳外伸段外缘局部 X（负值；登车梯挂钩/LED 灯串定位用） */
  readonly extensionOuterX: number;
}

/** 褶皱斜顶条带：宽沿局部 X（width），底缘平（yBottom），顶缘自局部 −X 端 yTop0 线性斜到 +X 端 yTop1；
 *  褶齿沿 Z 往复；uv.x=0 在顶缘（固定边）、1 在底缘（自由边）。 */
function createSlantedPleatedStrip(
  width: number,
  pleats: number,
  depth: number,
  yBottom: number,
  yTop0: number,
  yTop1: number,
): THREE.BufferGeometry {
  const columns = Math.max(1, Math.round(pleats)) * 2 + 1;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i < columns; i++) {
    const t = i / (columns - 1);
    const x = (t - 0.5) * width;
    const yTop = yTop0 + (yTop1 - yTop0) * t;
    const z = (i % 2 === 0 ? 1 : -1) * depth * 0.5;
    positions.push(x, yTop, z, x, yBottom, z);
    uvs.push(0, t, 1, t);
  }
  for (let i = 0; i < columns - 1; i++) {
    const a = i * 2;
    indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * RTT 车顶帐篷（已展开）：基座盒+上壳斜撑（上翻 180°−顶角，形成 12° 顶）+下壳水平外伸+
 * 三面褶皱侧布+前端防雨檐+帐篷顶布+撑腿。局部原点=铰链点（基座后缘/台面高度）。
 */
export function createRoofTent(assets: SharedAssets, id: string, params: RoofTentParams = {}): RoofTentResult {
  const baseLength = params.baseLength ?? 1.5;
  const baseHeight = params.baseHeight ?? 0.22;
  const baseWidth = params.baseWidth ?? 1.25;
  const extension = params.extension ?? 1.35;
  const roofAngleRad = ((params.roofAngleDeg ?? 12) * Math.PI) / 180;
  const swingRad = Math.PI - roofAngleRad; // 上壳自闭态（+X 平放基座上）上翻角＝180°−12°（draft「−165°」同幅）
  const pleats = params.pleats ?? 6;
  const name = params.name ?? `${id}/rtt`;
  const cacheId = `${id}|${baseLength}|${baseHeight}|${baseWidth}|${extension}|${params.roofAngleDeg ?? 12}|${pleats}`;

  const group = new THREE.Group();
  group.name = `${name}/tent`;

  const shellMaterial = toonMaterials.get('matteProp', { color: '#8e9484', name: `${name}/shell` });
  const shellHalfW = baseWidth / 2;
  const platformHalfW = shellHalfW - 0.05;

  /* —— 基座盒（沿 +X 前伸；铰链位于基座后缘=局部原点）—— */
  const baseMesh = new THREE.Mesh(
    assets.geometry(`${cacheId}/base`, () => {
      const geometry = hardenEdges(roundedBox({ width: baseLength, height: baseHeight, depth: baseWidth, radius: 0.02 }));
      geometry.translate(baseLength / 2, baseHeight / 2, 0);
      return geometry;
    }),
    shellMaterial,
  );
  baseMesh.name = `${name}/base`;
  baseMesh.castShadow = true;
  group.add(baseMesh);

  /* —— 下壳（水平外伸 extension：沿 −X；顶面略低于基座底——硬壳 RTT 抽拉床板读法）—— */
  const extensionOuterX = -extension;
  const bottomMesh = new THREE.Mesh(
    assets.geometry(`${cacheId}/bottom`, () => {
      const geometry = hardenEdges(roundedBox({ width: extension, height: 0.1, depth: baseWidth - 0.1, radius: 0.015 }));
      geometry.translate(-extension / 2, -0.06, 0);
      return geometry;
    }),
    shellMaterial,
  );
  bottomMesh.name = `${name}/bottom`;
  bottomMesh.castShadow = true;
  group.add(bottomMesh);

  // 下壳撑腿 ×2（伸缩管撑向货斗栏板顶——落点核对归调用方）
  const strutGeometry = assets.geometry(`${cacheId}/strut`, () => {
    const leg = new THREE.CylinderGeometry(0.02, 0.024, 0.41, 8);
    leg.translate(0, -0.265, 0);
    return hardenEdges(leg);
  });
  for (const side of [-1, 1]) {
    const strut = new THREE.Mesh(strutGeometry, shellMaterial);
    strut.name = `${name}/strut/${side}`;
    strut.position.set(-extension * 0.55, -0.11, side * baseWidth * 0.3);
    group.add(strut);
  }

  // 铰链扣件 ×2（基座后缘上下扣板）
  const hingeGeometry = assets.geometry(`${cacheId}/hinge`, () => hardenEdges(roundedBox({ width: 0.1, height: 0.12, depth: 0.07, radius: 0.01 })));
  for (const side of [-1, 1]) {
    const bracket = new THREE.Mesh(hingeGeometry, shellMaterial);
    bracket.name = `${name}/hinge/${side}`;
    bracket.position.set(0.02, baseHeight * 0.5, side * shellHalfW * 0.72);
    group.add(bracket);
  }

  /* —— 上壳组：绕局部 Z 上翻 swing=180°−顶角，斜撑成 12° 顶（覆盖下壳外伸段）—— */
  const topShellGroup = new THREE.Group();
  topShellGroup.name = `${name}/top`;
  topShellGroup.rotation.z = swingRad;
  const topMesh = new THREE.Mesh(
    assets.geometry(`${cacheId}/top-shell`, () => {
      const geometry = hardenEdges(roundedBox({ width: baseLength, height: 0.09, depth: baseWidth, radius: 0.02 }));
      geometry.translate(baseLength / 2, 0, 0); // 闭态：沿 +X 平放于基座上
      return geometry;
    }),
    shellMaterial,
  );
  topMesh.name = `${name}/top-shell`;
  topMesh.castShadow = true;
  topShellGroup.add(topMesh);
  group.add(topShellGroup);

  /* —— 帐布（左右侧布+后幅+顶布合并=单网格单 ClothHandle；帐件 noOutline 同 C 型帐帘带）—— */
  const fabricMaterial = toonMaterials.getToon('cloth', {
    color: '#c2b28a', emissive: '#ffb066', emissiveIntensity: 0, outline: false, name: `${name}/fabric`,
  });
  fabricMaterial.side = THREE.DoubleSide; // 工厂无 side 参数——唯一 name 缓存键内设置（同 C 型帐帘带做法）
  // 上壳下缘高度（tent 局部）：铰链处沿壳轴 d 距离的棚下缘
  const roofUnderside = (distanceFromHinge: number): number => baseHeight + Math.tan(roofAngleRad) * distanceFromHinge - 0.045;
  const yBottom = -0.01; // 帐布底缘=下壳顶面
  const sideSpan = extension - 0.04;
  const yTopHinge = roofUnderside(0.03) - 0.02;
  const yTopOuter = roofUnderside(sideSpan) - 0.02;
  const fabricParts: THREE.BufferGeometry[] = [];
  for (const side of [-1, 1]) {
    // 条带局部 −X 端映射到外伸段外端（yTop0=外端）、+X 端映射到铰链端（yTop1）
    const strip = createSlantedPleatedStrip(sideSpan, pleats, 0.045, yBottom, yTopOuter, yTopHinge);
    strip.translate(-sideSpan / 2, 0, side * platformHalfW);
    fabricParts.push(strip);
  }
  // 后幅（外端竖面，褶皱；登车口端）
  const rearStrip = createSlantedPleatedStrip(baseWidth - 0.1, pleats, 0.045, yBottom, yTopOuter, yTopOuter);
  rearStrip.rotateY(Math.PI / 2); // 宽转沿 Z（褶齿转沿 X）
  rearStrip.translate(extensionOuterX + 0.02, 0, 0);
  fabricParts.push(rearStrip);
  // 顶布（帐篷顶布 ClothHandle 0.8+clothTop：覆于上壳顶面，随上壳组变换后并入帐布单网格）
  const drape = new THREE.PlaneGeometry(baseLength, baseWidth + 0.04, 6, 4);
  drape.rotateX(-Math.PI / 2);
  drape.translate(baseLength / 2, 0.058, 0);
  drape.applyMatrix4(new THREE.Matrix4().makeRotationZ(swingRad).setPosition(0, baseHeight, 0));
  fabricParts.push(drape);
  const fabricMerged = mergeGeometries(fabricParts);
  if (!fabricMerged) throw new Error(`[overlandTruck/roofTent] 帐布合并失败：${cacheId}`);
  const fabricMesh = new THREE.Mesh(fabricMerged, fabricMaterial);
  fabricMesh.name = `${name}/fabric`;
  fabricMesh.userData.noOutline = true;
  fabricMesh.castShadow = false;
  group.add(fabricMesh);

  /* —— 前端防雨檐：外端（登车口）开口檐，自顶棚外缘下俯出挑——静态展开态直接按世界位形落入 tent 组 —— */
  const eaveLength = 0.3;
  const eaveDip = 0.44 - roofAngleRad; // 檐体下俯角（相对水平 ≈13°：0.44−12°）
  const eaveDirAngle = -(Math.PI - eaveDip); // 檐向自顶棚外缘向 rear-down 出挑（−X 且下俯）
  const eave = new THREE.Mesh(
    assets.geometry(`${cacheId}/eave`, () => {
      const geometry = hardenEdges(new THREE.BoxGeometry(eaveLength, 0.012, baseWidth + 0.02));
      geometry.translate(eaveLength / 2, 0, 0); // 檐体沿局部 +X 展开
      return geometry;
    }),
    fabricMaterial,
  );
  eave.name = `${name}/eave`;
  eave.userData.noOutline = true;
  const eaveStartX = -Math.cos(roofAngleRad) * baseLength;
  const eaveStartY = baseHeight + Math.sin(roofAngleRad) * baseLength;
  eave.position.set(eaveStartX, eaveStartY, 0); // 檐体几何沿局部 +X 0..0.3——起点=顶棚外缘
  eave.rotation.z = eaveDirAngle;
  group.add(eave);

  return { group, fabricMesh, fabricMaterial, shellMaterial, topShellGroup, roofAngleRad, extensionOuterX };
}
