// docs/01-整体架构.md §3.2 content/weathers/presets.ts —— 五档正式预设数据（光照修正/粒子/材质状态/风力系数，§3.3.5）；T30 落点。
// 定值来源（逐格）：docs/05-时间天气动效.md §4.4.1「五档 WeatherPreset 定值总表」（三要素 + windMul）；
// 粒子逐字值取 §4.4.2 五-3/五-5 与 §7.1.3 粒子总表（参数唯一参数源，docs/00 一.12 B4）。
// 纯数据纪律（§3.3.5 + §3.3.6）：不 import 任何内容模块；ParticleSpec 契约取自 systems/handles；
// 「怎么变」由 WeatherMaterialSystem / ParticleSystem / WindSystem 过渡执行，本文件只写参数。
// 注记①：clear 全中性基准（五-1）——时间预设直通生效，粒子空数组。
// 注记②：snow 粒子发射区 §4.4.1/§7.1.3 表未单列，取与 rain 同一发射区 3.4×3.4×2.4m——自洽校验：
//         0.55m/s×4.4s≈2.42m 与发射区高 2.4 一致（雨同式 4.5×0.53≈2.385），存活峰值 180×4.4≈792≈800 ✓。
// 注记③：snow 粒子色表未单列，取 §4.4.2 SnowMaterial 雪白 toon #EDF2F9 同源；非 additive（白色实心
//         雪点，加色混合会在亮天空/灯区过曝；雨丝 additive #A8C8E8 为表内逐字值）。
import * as THREE from 'three';
import type { ParticleSpec } from '@/systems/handles';
import type { WeatherPreset } from '@/content/weathers/types';

/**
 * 五-3 雨丝（§4.4.2 五-3 + §7.1.3 rain 行逐字值）。
 * 拉伸 quad (size0,size1)=(宽 0.008, 长 0.14)——shader 拉伸 kind 直读（systems/particles.ts aSize 注记）；
 * 速度拉伸/风漂 0.3×wind/涟漪由 rain kind 常数承担，预设只给初速 −4.5m/s↓。
 */
const rainSpec: ParticleSpec = {
  kind: 'rain',
  area: new THREE.Vector3(3.4, 3.4, 2.4), // 发射区 3.4×3.4×2.4m（存活 ≈450×0.53≈240）
  rate: 450,
  lifetime: 0.53,
  size0: 0.008, // 拉伸 quad 宽
  size1: 0.14, // 拉伸 quad 长
  vel0: new THREE.Vector3(0, -4.5, 0), // 4.5m/s↓+风漂 0.3×wind
  color: '#A8C8E8',
  opacity: 0.35,
  additive: true,
};

/**
 * 五-5 雪花（§4.4.2 五-5 + §7.1.3 snow 行逐字值；发射区/色值见文件头注记②③）。
 * 横摆 ±0.08m/风漂/自旋由 snow kind 常数承担（sway 0.08m/0.35Hz）；70% 软圆点+30% 六瓣雪晶由
 * kind 贴图承担；size0→size1 = quad 0.02~0.045m 渐变。
 */
const snowSpec: ParticleSpec = {
  kind: 'snow',
  area: new THREE.Vector3(3.4, 3.4, 2.4),
  rate: 180,
  lifetime: 4.4,
  size0: 0.02,
  size1: 0.045,
  vel0: new THREE.Vector3(0, -0.55, 0), // 0.55m/s 缓落+横摆±0.08+风漂
  color: '#EDF2F9',
  opacity: 0.85,
  additive: false,
};

/** clear 晴朗（默认档）：全中性基准（五-1）——时间预设直通生效。 */
export const clearPreset: WeatherPreset = {
  id: 'clear',
  label: '晴朗',
  isDefault: true, // 默认组合四维之一：海崖·C型·黄昏·晴朗（原文 L3/L151、core/state DEFAULT_STATE）
  lightMod: {
    intensityMul: 1.0,
    ambientMul: 1.0,
    glowBoost: 0,
  },
  particles: [], // 晴朗基准：无天气粒子
  material: {
    wetness: 0,
    puddle: 0,
    clothSag: 0,
    snowCover: 0,
    lineFade: 0,
    fogMul: 1.0,
    cloudShadow: 0,
  },
  windMul: 1.0,
  transitionMs: 1500, // 五-6 与四-5 同标准（决策 D5）
};

/** cloudy 多云：云量走 sky、光照柔化 + 云影地面缓移（§4.4.2 五-2）。 */
export const cloudyPreset: WeatherPreset = {
  id: 'cloudy',
  label: '多云',
  lightMod: {
    intensityMul: 0.82,
    ambientMul: 1.12,
    glowBoost: 0.15,
  },
  particles: [], // 云量走 sky（云条带 opacity 0.15→0.55、天空两端色 lerp 25%），无粒子
  material: {
    wetness: 0,
    puddle: 0,
    clothSag: 0,
    snowCover: 0,
    lineFade: 0,
    fogMul: 1.15,
    cloudShadow: 1.0, // 云影地面缓移（512² fbm、风移 UV）
  },
  windMul: 1.3, // 风力略增
  transitionMs: 1500,
};

/** rain 小雨：雨丝粒子 + 地面湿润/水洼/布料下凹/檐滴面（§4.4.2 五-3）。 */
export const rainPreset: WeatherPreset = {
  id: 'rain',
  label: '小雨',
  lightMod: {
    intensityMul: 0.62,
    ambientMul: 0.9,
    glowBoost: 0.35,
  },
  particles: [rainSpec],
  material: {
    wetness: 1.0, // 地面湿润反光 + 夜间彩色反光条 op=wetness×功率×0.5
    puddle: 1.0, // 水洼涟漪
    clothSag: 1.0, // 布料积水下凹（sagAmp 按布料表）
    snowCover: 0,
    lineFade: 0,
    fogMul: 1.35,
    cloudShadow: 0.7,
  },
  windMul: 1.45,
  transitionMs: 1500,
};

/** fog 浓雾：D6 单通道雾主档 + 扩散光晕 glowBoost 0.8 + 静风（§4.4.2 五-4）。 */
export const fogPreset: WeatherPreset = {
  id: 'fog',
  label: '浓雾',
  lightMod: {
    intensityMul: 0.55,
    ambientMul: 1.05,
    glowBoost: 0.8, // 扩散光晕最高档（夜间浓雾「更暗+更强光晕」示例，§4.4.4）
  },
  particles: [], // 浓雾走雾主通道（fogMul 2.60）与景深压缩，无粒子
  material: {
    wetness: 0.15,
    puddle: 0.2,
    clothSag: 0.1,
    snowCover: 0,
    lineFade: 0,
    fogMul: 2.6,
    cloudShadow: 0.5,
  },
  windMul: 0.85, // 雾天静风
  transitionMs: 1500,
};

/** snow 降雪：雪花粒子 + 四种积雪覆层 + 划线若隐若现 + 雪夜提亮（§4.4.2 五-5）。 */
export const snowPreset: WeatherPreset = {
  id: 'snow',
  label: '降雪',
  lightMod: {
    intensityMul: 0.8,
    ambientMul: 1.1, // 雪面反光提亮（雪夜不漆黑）
    glowBoost: 0.25,
  },
  particles: [snowSpec],
  material: {
    wetness: 0.1,
    puddle: 0.15,
    clothSag: 0.35, // 雪压
    snowCover: 1.0, // roofTop/clothTop/树冠/地面薄雪四做法（visible=snowCover>0.01）
    lineFade: 1.0, // 服务区划线 opacity=1−0.85×lineFade 若隐若现
    fogMul: 1.4,
    cloudShadow: 0.6,
  },
  windMul: 1.1,
  transitionMs: 1500,
};

/** 五档预设集合（顺序 = UI 分段按钮注册顺序，§3.3.5「登记即被识别」）。 */
export const weatherPresets: readonly WeatherPreset[] = [
  clearPreset,
  cloudyPreset,
  rainPreset,
  fogPreset,
  snowPreset,
];
