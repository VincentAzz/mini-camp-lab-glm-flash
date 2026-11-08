// docs/01-整体架构.md §3.2 content/times/presets.ts —— 四档正式预设数据（全局光照 + 语义通道，§3.3.4）；T29 落点。
// 定值来源（逐格）：docs/05-时间天气动效.md §4.3.2「四档 GlobalLightParams 定值表」+「六语义通道全局定值」表
// （★全场景统一，场景只做解释——逐场景差异见 docs/05 §4.3.4 矩阵，由各场景 lightHooks 消费）。
// 纯数据纪律（§3.3.4 注记 + §3.3.6）：不 import 任何内容模块；GlobalLightParams/SkyExtra 契约
// 经 TimePreset 类型（content/times/types → systems/handles）间接引用；「怎么变」由
// TimeLightSystem + TransitionController 执行，本文件只写参数。
// 注记①：lightDir 为「指向日/月的单位向量」，由 §4.3.2 仰角/方位换算（handles.ts lightDir 注记）——
//         换算在本文件 lightDirFrom() 内完成，仰角/方位角以字面量入参保持与文档表逐格可对照。
// 注记②：shadowBias 在 §4.3.2 表中无行，取 docs/04-三渲二渲染.md「阴影」段定值 bias≈-0.0005（全档同值，
//         过渡仍对它逐帧 lerp，docs/05 §4.3.5「阴影只 lerp radius/bias」）。
import * as THREE from 'three';
import type { TimePreset } from '@/content/times/types';

/** 阴影 bias（docs/04 三渲二「阴影」定值 -0.0005；§4.3.2 表无 bias 行，四档共用，见文件头注记②）。 */
const SHADOW_BIAS = -0.0005;

const DEG2RAD = Math.PI / 180;

/**
 * §4.3.2「主光源」行的仰角/方位 → 指向日/月的单位向量（GlobalLightParams.lightDir 契约换算）。
 * 世界轴向：+X 东 / +Y 上 / −Z 北（+Z 南，右手系地理映射）；方位角自正北起顺时针（东 90°/南 180°/
 * 西 270°）、仰角自水平面起算。消费侧 systems/timeLight.ts applyParams①：位置=方向×距离、target 原点，
 * 方向不对就地改写（契约纪律，过渡由 core/transition.ts lerpDirection 生成新向量）。
 */
function lightDirFrom(elevDeg: number, azimuthDeg: number): THREE.Vector3 {
  const el = elevDeg * DEG2RAD;
  const az = azimuthDeg * DEG2RAD;
  // 水平分量 = 方位角单位向量 × cos(仰角)，y = sin(仰角)；模长恒 1（sin²+cos² 恒等），normalize 兜底。
  return new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).normalize();
}

/** dawn 清晨：青金低角度长投影 + 朝霞条带；灯将熄未熄/余烬/炊烟/商业刚开灯（§4.3.2 dawn 列逐格）。 */
export const dawnPreset: TimePreset = {
  id: 'dawn',
  label: '清晨',
  lighting: {
    lightDir: lightDirFrom(9, 78), // 太阳，仰角 9°，方位东 78°（影长 ≈6.3× 物高）
    lightColor: '#A9CFE0', // 青金
    lightIntensity: 0.85,
    ambientSky: '#7FA0BC',
    ambientGround: '#5E6B5A',
    ambientIntensity: 1.0,
    zenith: '#4E6E9E',
    horizon: '#EFC9A0', // 朝霞金
    skyExtra: 'dawnBands', // 朝霞条带 ×3
    fogBase: 0.18,
    shadowRadius: 4.0, // 长·软
    shadowBias: SHADOW_BIAS,
  },
  channels: {
    lampPower: 0.15, // 营地灯「将熄未熄」（§4.3.3-①：亮度 0.07~0.23 起伏）
    emberPower: 0.5, // 篝火余烬
    smokePower: 0.25, // 炊烟/蒸汽
    shopPower: 0.35, // 商业照明「刚开灯」（服务区售货机取 max(shopPower,0.7) ≥0.7）
    interiorPower: 0.2,
    interiorEmphasis: 0.2,
  },
  transitionMs: 1500, // 决策 D5 定值（docs/05 §4.3.5）
};

/** day 白天：正午亮·短锐影·灯具全熄·炊烟满量（§4.3.2 day 列逐格）。 */
export const dayPreset: TimePreset = {
  id: 'day',
  label: '白天',
  lighting: {
    // 太阳，仰角 62°，方位南 12°——文档方位值按「南偏 12°」读（纯罗盘方位 12° 为北象限，与「南」
    // 注记矛盾），取南偏东 12° = 罗盘 168°（正午前、晨昏太阳路径 dawn78°→dusk262° 顺时针自洽）。
    lightDir: lightDirFrom(62, 168),
    lightColor: '#FFF4E0',
    lightIntensity: 1.2,
    ambientSky: '#BFD9EC',
    ambientGround: '#8A9478',
    ambientIntensity: 1.0,
    zenith: '#3E86C8',
    horizon: '#CBE6F5',
    skyExtra: 'dayClouds', // 少量白云条带 op 0.25
    fogBase: 0.02,
    shadowRadius: 1.6, // 短·锐
    shadowBias: SHADOW_BIAS,
  },
  channels: {
    lampPower: 0, // 「灯具全熄」仅指营地/装饰灯具（D8 二分法；§4.3.3-⑤ emissive=0+halo 隐藏）
    emberPower: 0, // 白天火熄，炊烟代替（B8）
    smokePower: 1.0, // 白天活动细节（rate=2.2×smokePower+0.4 → 2.6/s）
    shopPower: 1.0, // 灯箱营业亮（D8）
    interiorPower: 0,
    interiorEmphasis: 0,
  },
  transitionMs: 1500,
};

/** dusk 黄昏（默认档）：金橙晚霞+蓝调带·点灯时刻（§4.3.2 dusk 列逐格）。 */
export const duskPreset: TimePreset = {
  id: 'dusk',
  label: '黄昏',
  isDefault: true, // 默认组合四维之一：海崖·C型·黄昏·晴朗（原文 L3/L151、core/state DEFAULT_STATE）
  lighting: {
    lightDir: lightDirFrom(11, 262), // 太阳，仰角 11°，方位西 262°（影长 ≈5.1× 物高）
    lightColor: '#FFB35C', // 金橙
    lightIntensity: 1.05,
    ambientSky: '#7B87C4',
    ambientGround: '#6A5E58',
    ambientIntensity: 0.95,
    zenith: '#3C4E96',
    horizon: '#FF8E4F', // 晚霞橙（蓝调带 = horizon 之上 15%~40% 插 #5A6AA8，属 duskBands 渲染面）
    skyExtra: 'duskBands', // 晚霞条带 + 「蓝调带」
    fogBase: 0.06,
    shadowRadius: 3.6, // 长·软
    shadowBias: SHADOW_BIAS,
  },
  channels: {
    lampPower: 1.0, // 「点灯时刻」0→1 随 1500ms 过渡上升（§4.3.3-⑦）
    emberPower: 1.0,
    smokePower: 0.35,
    shopPower: 0.65, // 招牌灯箱初亮+循环微闪
    interiorPower: 0.85, // 车内灯点亮（冷暖对比核心档，§7.1.6）
    interiorEmphasis: 0.7,
  },
  transitionMs: 1500,
};

/** night 夜间：月色深蓝紫 + 星空月面·全灯点亮主角档（§4.3.2 night 列逐格）。 */
export const nightPreset: TimePreset = {
  id: 'night',
  label: '夜间',
  lighting: {
    lightDir: lightDirFrom(42, 210), // 月亮，仰角 42°，方位西南 210°
    lightColor: '#93A9DC', // 月青
    lightIntensity: 0.38,
    ambientSky: '#35426E',
    ambientGround: '#1E2438',
    ambientIntensity: 0.7,
    zenith: '#0C1531',
    horizon: '#26325C',
    skyExtra: 'nightStarsMoon', // 星空 900 点 + 银河带 300 暗点 + 月面 + 月晕 ×2.4
    fogBase: 0.05,
    shadowRadius: 3.0, // 中·软
    shadowBias: SHADOW_BIAS,
  },
  channels: {
    lampPower: 1.0, // 四-4 枚举 8 项灯全亮 + additive halo（§4.3.3-⑧）
    emberPower: 1.0,
    smokePower: 0.15,
    shopPower: 1.0, // 招牌/售货机/车流为主角
    interiorPower: 1.0,
    interiorEmphasis: 1.0, // 车内暖光更突出（四-4）
  },
  transitionMs: 1500,
};

/** 四档预设集合（顺序 = UI 分段按钮注册顺序，§3.3.4「登记即被识别」）。 */
export const timePresets: readonly TimePreset[] = [dawnPreset, dayPreset, duskPreset, nightPreset];
