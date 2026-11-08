// docs/01-整体架构.md §3.2 geom/parts/wasteland/texPaint.ts —— 避难所部件共享 Canvas 贴图绘制器。
// docs/02-场景模块.md §4.1.3（2.3.2 逐组材质面 + 2.3.3 配色纪律：锈红/沙黄饱和度压低、无暗黑底、
//   荧光只做小面积点缀）+ docs/04-三渲二渲染.md §5.4（程序化贴图：语义图形可烘色、底面近白中值、
//   噪声幅度 ≤8% 纪律）。全部代码生成（八.2 红线）；★禁止人物几何（一.6）——工装=衣物剪影非人形。
// T20 落点。
import * as THREE from 'three';
import { createFbm2D, hashStringToSeed } from '@/tex/canvasTex';
import { clamp } from '@/shared/math';

export type CanvasDraw = (ctx: CanvasRenderingContext2D, w: number, h: number) => void;

/** Canvas→CanvasTexture 薄封装（与 seacliff.ts 同构；transparent 时 ClampToEdge+map alpha 承载形状）。 */
export function paintCanvasTexture(key: string, w: number, h: number, draw: CanvasDraw, transparent = false): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(2, w);
  canvas.height = Math.max(2, h);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error(`[wasteland] 无法获取 2d 上下文 ${key}`);
  try {
    draw(ctx, canvas.width, canvas.height);
  } catch (err) {
    console.warn(`[wasteland] 贴图绘制失败，降级留白 ${key}`, err);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = transparent ? 'rgba(0,0,0,0)' : '#dddddd';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.name = key;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = transparent ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
  texture.needsUpdate = true;
  return texture;
}

/**
 * 锈蚀金属面（④集装箱 rustPatch「褪色蓝绿+锈 blotch」/⑦油桶共面配方）：
 * 基色中值 + fbm 明暗 ≤6% + 锈斑（rustRed/rustDark 低饱和椭圆）+ 竖向锈渍流痕。
 */
export function drawRustMetal(ctx: CanvasRenderingContext2D, w: number, h: number, seedKey: string, base: string): void {
  const fbm = createFbm2D(hashStringToSeed(seedKey), 3);
  const image = ctx.createImageData(w, h);
  const data = image.data;
  const baseColor = new THREE.Color(base);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const n = (fbm((x / w) * 14, (y / h) * 14) - 0.5) * 0.06;
      const i = (y * w + x) * 4;
      data[i] = Math.round(clamp(baseColor.r + n, 0, 1) * 255);
      data[i + 1] = Math.round(clamp(baseColor.g + n, 0, 1) * 255);
      data[i + 2] = Math.round(clamp(baseColor.b + n, 0, 1) * 255);
      data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  const rng = { next: (() => { let s = hashStringToSeed(`${seedKey}/blotch`); return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; })() };
  const blotchColors = ['rgba(160,82,56,0.30)', 'rgba(124,58,40,0.26)', 'rgba(146,96,60,0.22)'];
  for (let i = 0; i < 26; i++) {
    const bx = rng.next() * w;
    const by = rng.next() * h;
    const bw = w * (0.03 + rng.next() * 0.09);
    const bh = h * (0.05 + rng.next() * 0.14);
    ctx.fillStyle = blotchColors[i % blotchColors.length] ?? 'rgba(160,82,56,0.28)';
    ctx.beginPath();
    ctx.ellipse(bx, by, bw, bh, rng.next() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  // 竖向流痕（锈水从顶边下淌，淡）
  ctx.strokeStyle = 'rgba(124,58,40,0.16)';
  ctx.lineWidth = Math.max(1.5, w * 0.012);
  for (let i = 0; i < 12; i++) {
    const sx = rng.next() * w;
    const len = h * (0.2 + rng.next() * 0.5);
    ctx.beginPath();
    ctx.moveTo(sx, 0);
    ctx.quadraticCurveTo(sx + (rng.next() - 0.5) * w * 0.04, len * 0.6, sx + (rng.next() - 0.5) * w * 0.06, len);
    ctx.stroke();
  }
}

/** 黄黑警示斜纹（①防爆门贴条；沙黄压低饱和 + 深灰，非纯黑——一·5「无暗黑底色」）。 */
export function drawHazardStripes(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.fillStyle = '#c9a94e';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#3c3a36';
  const band = w / 6;
  ctx.save();
  ctx.translate(-band, 0);
  for (let i = 0; i < 10; i++) {
    ctx.beginPath();
    ctx.moveTo(i * band * 2, 0);
    ctx.lineTo(i * band * 2 + band, 0);
    ctx.lineTo(i * band * 2 + band - h, h);
    ctx.lineTo(i * band * 2 - h, h);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

/** 铁丝网 alpha 网面（⑤ guardNet：透明底 + 菱形网孔白线；贴图 alpha 承载网形）。 */
export function drawWireNetAlpha(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.clearRect(0, 0, w, h);
  ctx.strokeStyle = 'rgba(214,214,208,0.92)';
  ctx.lineWidth = Math.max(1.5, w * 0.014);
  const step = w / 6;
  for (let gx = -h; gx < w + h; gx += step) {
    ctx.beginPath();
    ctx.moveTo(gx, 0);
    ctx.lineTo(gx + h, h);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(gx + h, 0);
    ctx.lineTo(gx, h);
    ctx.stroke();
  }
}

/** 手写警示牌牌面（⑦：白底 + 红字「立入禁止／危ない！」手写笔迹——J6；★不画骷髅图形，一·5）。 */
export function drawWarningSignFace(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.fillStyle = '#ece7da';
  ctx.fillRect(0, 0, w, h);
  // 边框微脏（手写牌不做圆角标牌感）
  ctx.strokeStyle = 'rgba(90,84,76,0.35)';
  ctx.lineWidth = Math.max(2, w * 0.02);
  ctx.strokeRect(w * 0.04, h * 0.05, w * 0.92, h * 0.9);
  const red = '#b8382e';
  ctx.fillStyle = red;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // 手写笔迹：圆体系统字体栈 + 每字微转（J6「手写笔迹」）
  const font = '"Hiragino Maru Gothic ProN", "Yu Gothic", "Comic Sans MS", sans-serif';
  const jitter = [0, -0.05, 0.04, -0.03];
  const chars = ['立', '入', '禁', '止'];
  const size = w * 0.2;
  ctx.font = `bold ${size}px ${font}`;
  chars.forEach((ch, i) => {
    ctx.save();
    ctx.translate(w * (0.18 + i * 0.215), h * 0.3);
    ctx.rotate(jitter[i] ?? 0);
    ctx.fillText(ch, 0, 0);
    ctx.restore();
  });
  ctx.font = `bold ${w * 0.26}px ${font}`;
  ctx.save();
  ctx.translate(w * 0.5, h * 0.68);
  ctx.rotate(0.03);
  ctx.fillText('危ない！', 0, 0);
  ctx.restore();
  // 底部小字警示行（英文补充，同海崖 J6 双语口径）
  ctx.font = `${w * 0.075}px "Helvetica Neue", Arial, sans-serif`;
  ctx.fillStyle = 'rgba(122,60,52,0.85)';
  ctx.fillText('DANGER - KEEP OUT', w * 0.5, h * 0.9);
}

/** 浅油渍 decal（2.3.1「2 处浅油渍 decal，干净风：小而淡」——中心深、边缘羽化，整体 α 低）。 */
export function drawOilStain(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.clearRect(0, 0, w, h);
  const grad = ctx.createRadialGradient(w / 2, h / 2, w * 0.05, w / 2, h / 2, w * 0.48);
  grad.addColorStop(0, 'rgba(52,54,58,0.34)');
  grad.addColorStop(0.55, 'rgba(58,60,64,0.20)');
  grad.addColorStop(1, 'rgba(60,62,66,0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.ellipse(w / 2, h / 2, w * 0.48, h * 0.42, 0.4, 0, Math.PI * 2);
  ctx.fill();
}

/** 四角沙地补丁（2.3.1「四角沙地补丁」——sandDust 中值底 + 细沙噪点，圆形羽化边缘）。 */
export function drawSandPatch(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.clearRect(0, 0, w, h);
  const grad = ctx.createRadialGradient(w / 2, h / 2, w * 0.1, w / 2, h / 2, w * 0.5);
  grad.addColorStop(0, 'rgba(201,169,110,0.95)');
  grad.addColorStop(0.75, 'rgba(201,169,110,0.8)');
  grad.addColorStop(1, 'rgba(201,169,110,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  const fbm = createFbm2D(hashStringToSeed('wasteland/sandpatch'), 3);
  ctx.globalCompositeOperation = 'source-atop';
  const image = ctx.getImageData(0, 0, w, h);
  const data = image.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const n = (fbm((x / w) * 26, (y / h) * 26) - 0.5) * 30;
      const i = (y * w + x) * 4;
      if (data[i + 3]! > 0) {
        data[i] = Math.round(clamp(data[i]! + n, 0, 255));
        data[i + 1] = Math.round(clamp(data[i + 1]! + n * 0.9, 0, 255));
        data[i + 2] = Math.round(clamp(data[i + 2]! + n * 0.7, 0, 255));
      }
    }
  }
  ctx.putImageData(image, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
}

/** 雨天水洼 decal（05 §五-3「水洼涟漪」预烘 alpha 区；随 uWet 增深——registered ground-kind 面）。 */
export function drawPuddle(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.clearRect(0, 0, w, h);
  const grad = ctx.createRadialGradient(w * 0.45, h * 0.5, w * 0.04, w * 0.5, h * 0.5, w * 0.46);
  grad.addColorStop(0, 'rgba(126,138,144,0.85)');
  grad.addColorStop(0.7, 'rgba(126,138,144,0.55)');
  grad.addColorStop(1, 'rgba(126,138,144,0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.ellipse(w * 0.5, h * 0.52, w * 0.47, h * 0.4, 0.25, 0, Math.PI * 2);
  ctx.fill();
}

/** 太阳能电池板面（⑨：深蓝硅板 + 银栅线格 + 中值明度纪律）。 */
export function drawSolarCell(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.fillStyle = '#2e4a5e';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = 'rgba(190,198,204,0.75)';
  ctx.lineWidth = Math.max(1, w * 0.012);
  const cols = 6;
  const rows = 4;
  for (let i = 0; i <= cols; i++) {
    ctx.beginPath();
    ctx.moveTo((w * i) / cols, 0);
    ctx.lineTo((w * i) / cols, h);
    ctx.stroke();
  }
  for (let j = 0; j <= rows; j++) {
    ctx.beginPath();
    ctx.moveTo(0, (h * j) / rows);
    ctx.lineTo(w, (h * j) / rows);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(210,218,224,0.9)';
  ctx.lineWidth = Math.max(1.5, w * 0.02);
  ctx.strokeRect(1, 1, w - 2, h - 2);
}

/**
 * 工装衣物剪影（⑫「ShapeGeometry 剪影」的等观感实现：alpha 贴图剪影形——保留 WindSystem
 * 12×8 顶点位移链的 clothMicro 路径，见部件文件头裁定注记）。
 * 绘制坐标系：画布 x=衣物纵向（肩线在 x=0）、画布 y=衣物横向——与晾衣部件 mesh.rotation.z=−π/2
 * 后的 uv 采样方向一致（uv.x=固定边=挂点侧）。
 */
export function drawGarmentSilhouette(ctx: CanvasRenderingContext2D, w: number, h: number, kind: 'jacket' | 'overalls' | 'tee'): void {
  // 正立绘制进离屏画布，再旋转落位（正立=肩在上）
  const size = Math.max(w, h);
  const off = document.createElement('canvas');
  off.width = size;
  off.height = size;
  const octx = off.getContext('2d');
  if (!octx) throw new Error('[wasteland] 离屏画布不可用');
  octx.clearRect(0, 0, size, size);
  const cx = size / 2;
  const colors: Record<typeof kind, string> = {
    jacket: '#8a8a6a', // 褪色军绿工装
    overalls: '#6a7a88', // 褪色蓝灰背带裤
    tee: '#c9b08a', // 沙黄旧 T 恤
  };
  const fill = colors[kind] ?? '#8a8a6a';
  octx.fillStyle = fill;
  const top = size * 0.16;
  if (kind === 'jacket') {
    // 工装外套：肩线 + 双袖 + 衣身 + 门襟贴袋
    octx.beginPath();
    octx.moveTo(cx - size * 0.16, top);
    octx.lineTo(cx - size * 0.3, top + size * 0.06);
    octx.lineTo(cx - size * 0.36, top + size * 0.44);
    octx.lineTo(cx - size * 0.28, top + size * 0.47);
    octx.lineTo(cx - size * 0.24, top + size * 0.2);
    octx.lineTo(cx - size * 0.24, top + size * 0.66);
    octx.lineTo(cx + size * 0.24, top + size * 0.66);
    octx.lineTo(cx + size * 0.24, top + size * 0.2);
    octx.lineTo(cx + size * 0.28, top + size * 0.47);
    octx.lineTo(cx + size * 0.36, top + size * 0.44);
    octx.lineTo(cx + size * 0.3, top + size * 0.06);
    octx.lineTo(cx + size * 0.16, top);
    octx.lineTo(cx, top + size * 0.05);
    octx.closePath();
    octx.fill();
    octx.fillStyle = 'rgba(60,58,50,0.25)';
    octx.fillRect(cx - size * 0.03, top + size * 0.1, size * 0.06, size * 0.54);
    octx.fillRect(cx - size * 0.18, top + size * 0.38, size * 0.1, size * 0.12);
    octx.fillRect(cx + size * 0.08, top + size * 0.38, size * 0.1, size * 0.12);
  } else if (kind === 'overalls') {
    // 背带裤：窄肩带 + 裤身 + 胸袋
    octx.fillRect(cx - size * 0.14, top, size * 0.05, size * 0.24);
    octx.fillRect(cx + size * 0.09, top, size * 0.05, size * 0.24);
    octx.fillRect(cx - size * 0.19, top + size * 0.2, size * 0.38, size * 0.18);
    octx.fillRect(cx - size * 0.19, top + size * 0.34, size * 0.17, size * 0.36);
    octx.fillRect(cx + size * 0.02, top + size * 0.34, size * 0.17, size * 0.36);
    octx.fillStyle = 'rgba(50,54,62,0.3)';
    octx.fillRect(cx - size * 0.19, top + size * 0.2, size * 0.38, size * 0.045);
  } else {
    // T 恤：短袖
    octx.beginPath();
    octx.moveTo(cx - size * 0.17, top);
    octx.lineTo(cx - size * 0.32, top + size * 0.12);
    octx.lineTo(cx - size * 0.26, top + size * 0.24);
    octx.lineTo(cx - size * 0.2, top + size * 0.19);
    octx.lineTo(cx - size * 0.2, top + size * 0.64);
    octx.lineTo(cx + size * 0.2, top + size * 0.64);
    octx.lineTo(cx + size * 0.2, top + size * 0.19);
    octx.lineTo(cx + size * 0.26, top + size * 0.24);
    octx.lineTo(cx + size * 0.32, top + size * 0.12);
    octx.lineTo(cx + size * 0.17, top);
    octx.lineTo(cx, top + size * 0.045);
    octx.closePath();
    octx.fill();
    octx.fillStyle = 'rgba(90,76,54,0.22)';
    octx.fillRect(cx - size * 0.2, top + size * 0.56, size * 0.4, size * 0.03);
  }
  // 落位旋转：正立 (gx,gy) → 画布 (x,y)=(gy·k, size−gx·k)（肩线→画布 x=0 侧，见函数头注记）
  const sx = w / size;
  const sy = h / size;
  ctx.setTransform(0, -sy, sx, 0, 0, h);
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(off, 0, 0, size, size, 0, 0, size, size);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}
