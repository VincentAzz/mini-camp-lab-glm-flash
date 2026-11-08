// docs/01-整体架构.md §3.2 geom/parts/vehicles/classB/ —— T26 B型面包车专用部件：程序化贴图集。
// docs/03-车型模块.md §4.2.0 程序化贴图表「texRetroTwoTone（B 型波浪双色）/ texStickerDoodle
//   （4 枚手绘涂鸦：浪线/太阳/仙人掌/VAN LIFE）/ texGauze（纱帘网格）/ texWoodFloor（oak）」+
//   draft 12-车型模块 §6.3「tapestry：Canvas 几何纹样（菱形+流苏边）」。
// 全 Canvas 生成（八.2 红线），经 assets.texture 缓存；文字用系统字体栈 fillText（docs/03 §4.2.0）。
// ★ 禁止人形/人物几何（一.6）。
import * as THREE from 'three';
import type { SharedAssets } from '@/systems/handles';

type CanvasDraw = (ctx: CanvasRenderingContext2D, w: number, h: number) => void;

/** Canvas 程序化贴图（同 classC paintCanvasTexture 模式：绘制失败降级留白不抛错）。 */
function paintCanvasTexture(key: string, w: number, h: number, draw: CanvasDraw, transparent = false): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(2, w);
  canvas.height = Math.max(2, h);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error(`[classB/tex] 无法获取 2d 上下文 ${key}`);
  try {
    draw(ctx, canvas.width, canvas.height);
  } catch (err) {
    console.warn(`[classB/tex] 贴图绘制失败，降级留白 ${key}`, err);
    ctx.fillStyle = transparent ? 'rgba(0,0,0,0)' : '#dddddd';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.name = key;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.wrapS = transparent ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
  texture.wrapT = transparent ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
  texture.needsUpdate = true;
  return texture;
}

/** 确定性小抖动（贴纸手绘歪斜感；画家内部使用，不依赖 Rng——同 id 可复现）。 */
function jitter(seed: number, amp: number): number {
  const s = Math.sin(seed * 127.1) * 43758.5453;
  return ((s - Math.floor(s)) * 2 - 1) * amp;
}

/* ============================== texRetroTwoTone（3.4-1 车身波浪双色） ============================== */

/**
 * B 型车身贴图：奶油白底 + 芥末黄波浪双色（波浪带 v≈0.22..0.34，双波峰）+ 滑门缝 ×2 + 铆钉行。
 * v 对位口径与 classC 相同：v=(y−y0)/(y1−y0)，canvas 行=(1−v)×h——调用方按车身体量设 repeat/offset。
 */
export function createRetroTwoToneTexture(assets: SharedAssets, id: string, bodyColor: string, mustardColor: string): THREE.Texture {
  return assets.texture(`${id}/tex-retro`, () =>
    paintCanvasTexture(`${id}/tex-retro`, 512, 256, (ctx, w, h) => {
      ctx.fillStyle = bodyColor;
      ctx.fillRect(0, 0, w, h);
      // 波浪双色：芥末黄下带，上缘双波峰（v 0.34 处起波）
      const bandTop = 0.34 * h;
      const amp = h * 0.035;
      ctx.fillStyle = mustardColor;
      ctx.beginPath();
      ctx.moveTo(0, bandTop);
      const peaks = 6;
      for (let i = 0; i <= peaks * 2; i++) {
        const x = (w * i) / (peaks * 2);
        const y = bandTop + Math.sin((i / (peaks * 2)) * Math.PI * 4) * amp;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(w, h);
      ctx.lineTo(0, h);
      ctx.closePath();
      ctx.fill();
      // 波缘细饰线（奶油勾边，手绘感微歪）
      ctx.strokeStyle = 'rgba(253,246,230,0.85)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      for (let i = 0; i <= peaks * 2; i++) {
        const x = (w * i) / (peaks * 2);
        const y = bandTop + Math.sin((i / (peaks * 2)) * Math.PI * 4) * amp;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      // 滑门缝 ×2（v 0.1..0.42 竖缝）+ 门轨下缘短线
      ctx.fillStyle = 'rgba(0,0,0,0.14)';
      for (const seam of [0.335, 0.6]) {
        ctx.fillRect(seam * w, 0.08 * h, 2.5, 0.36 * h);
      }
      ctx.fillRect(0.335 * w, 0.44 * h, 0.265 * w, 2.5);
      // 铆钉行（波带上沿）
      ctx.fillStyle = 'rgba(0,0,0,0.10)';
      for (let i = 0; i < 26; i++) {
        ctx.beginPath();
        ctx.arc((w * (i + 0.5)) / 26, bandTop - h * 0.018, 1.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }),
  );
}

/* ============================== texGauze（3.4-4 纱帘网格） ============================== */

/** 纱帘网格 alpha 贴图：透明底 + 米白网格经纬线（疏密微差=织纹柔化读法）。 */
export function createGauzeTexture(assets: SharedAssets, id: string): THREE.Texture {
  return assets.texture(`${id}/tex-gauze`, () =>
    paintCanvasTexture(`${id}/tex-gauze`, 128, 128, (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h);
      ctx.strokeStyle = 'rgba(255,250,238,0.92)';
      const cell = 9;
      for (let x = 0; x <= w; x += cell) {
        ctx.lineWidth = 1.6 + ((x / cell) % 3 === 0 ? 0.9 : 0);
        ctx.beginPath();
        ctx.moveTo(x + jitter(x, 0.7), 0);
        ctx.lineTo(x + jitter(x + 1, 0.7), h);
        ctx.stroke();
      }
      for (let y = 0; y <= h; y += cell) {
        ctx.lineWidth = 1.6 + ((y / cell) % 4 === 0 ? 0.9 : 0);
        ctx.beginPath();
        ctx.moveTo(0, y + jitter(y + 2, 0.7));
        ctx.lineTo(w, y + jitter(y + 3, 0.7));
        ctx.stroke();
      }
      // 网结（交点微点）
      ctx.fillStyle = 'rgba(255,250,238,0.85)';
      for (let x = 0; x <= w; x += cell) {
        for (let y = 0; y <= h; y += cell) {
          ctx.fillRect(x - 0.8, y - 0.8, 1.6, 1.6);
        }
      }
    }, true),
  );
}

/* ============================== texStickerDoodle（3.4-5 手绘贴纸 ×4） ============================== */

/** 手绘涂鸦笔触帮手：粗圆帽描边 + 端点抖动（马克笔手绘感）。 */
function doodleStroke(ctx: CanvasRenderingContext2D, path: (c: CanvasRenderingContext2D) => void, color: string, width: number, seed: number): void {
  ctx.save();
  ctx.translate(jitter(seed, 1.6), jitter(seed + 7, 1.6));
  ctx.rotate(jitter(seed + 13, 0.05));
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  path(ctx);
  ctx.stroke();
  ctx.restore();
}

export interface StickerTextures {
  /** 浪线（青蓝三重波浪+浪花点） */
  readonly wave: THREE.Texture;
  /** 太阳（芥末圆盘+光芒） */
  readonly sun: THREE.Texture;
  /** 仙人掌（绿柱+双臂+盆线） */
  readonly cactus: THREE.Texture;
  /** VAN LIFE（系统字体栈粗斜体+下划浪线） */
  readonly vanlife: THREE.Texture;
}

/** 4 枚手绘涂鸦贴纸（3.4-5：浪线/太阳/仙人掌/VAN LIFE；透明底，手绘粗笔触）。 */
export function createStickerTextures(assets: SharedAssets, id: string, ink: string, mustard: string, teal: string): StickerTextures {
  const make = (tag: string, draw: CanvasDraw): THREE.Texture =>
    assets.texture(`${id}/tex-sticker-${tag}`, () => paintCanvasTexture(`${id}/tex-sticker-${tag}`, 128, 128, draw, true));

  const wave = make('wave', (ctx, w, h) => {
    for (let row = 0; row < 3; row++) {
      const yBase = h * (0.34 + row * 0.2);
      const color = row === 1 ? mustard : teal;
      doodleStroke(
        ctx,
        (c) => {
          c.moveTo(w * 0.1, yBase);
          for (let i = 0; i <= 8; i++) {
            const x = w * 0.1 + (w * 0.8 * i) / 8;
            c.lineTo(x, yBase + Math.sin((i / 8) * Math.PI * 2 + row) * h * 0.07);
          }
        },
        color,
        7,
        row + 1,
      );
    }
    ctx.fillStyle = teal;
    for (const [x, y] of [[0.22, 0.22], [0.74, 0.18], [0.84, 0.62]] as const) {
      ctx.beginPath();
      ctx.arc(w * x, h * y, 5 + jitter(x * 10, 1.5), 0, Math.PI * 2);
      ctx.fill();
    }
  });

  const sun = make('sun', (ctx, w, h) => {
    doodleStroke(
      ctx,
      (c) => c.arc(w / 2, h / 2, w * 0.2, 0, Math.PI * 2),
      mustard,
      7,
      3,
    );
    ctx.fillStyle = mustard;
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, w * 0.16, 0, Math.PI * 2);
    ctx.fill();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + jitter(i, 0.12);
      doodleStroke(
        ctx,
        (c) => {
          c.moveTo(w / 2 + Math.cos(a) * w * 0.26, h / 2 + Math.sin(a) * w * 0.26);
          c.lineTo(w / 2 + Math.cos(a) * w * 0.4, h / 2 + Math.sin(a) * w * 0.4);
        },
        i % 2 === 0 ? ink : mustard,
        6,
        i + 11,
      );
    }
  });

  const cactus = make('cactus', (ctx, w, h) => {
    doodleStroke(
      ctx,
      (c) => {
        c.moveTo(w * 0.44, h * 0.78);
        c.lineTo(w * 0.44, h * 0.3);
        c.quadraticCurveTo(w * 0.5, h * 0.2, w * 0.56, h * 0.3);
        c.lineTo(w * 0.56, h * 0.78);
      },
      '#4f7a5a',
      9,
      5,
    );
    doodleStroke(
      ctx,
      (c) => {
        c.moveTo(w * 0.44, h * 0.55);
        c.quadraticCurveTo(w * 0.28, h * 0.55, w * 0.28, h * 0.38);
      },
      '#4f7a5a',
      8,
      6,
    );
    doodleStroke(
      ctx,
      (c) => {
        c.moveTo(w * 0.56, h * 0.62);
        c.quadraticCurveTo(w * 0.74, h * 0.62, w * 0.74, h * 0.45);
      },
      '#4f7a5a',
      8,
      7,
    );
    doodleStroke(
      ctx,
      (c) => {
        c.moveTo(w * 0.32, h * 0.8);
        c.lineTo(w * 0.68, h * 0.8);
        c.lineTo(w * 0.62, h * 0.92);
        c.lineTo(w * 0.38, h * 0.92);
        c.closePath();
      },
      '#c2564a',
      6,
      8,
    );
    ctx.fillStyle = '#4f7a5a';
    for (const [x, y] of [[0.48, 0.42], [0.52, 0.5], [0.47, 0.6], [0.53, 0.68]] as const) {
      ctx.fillRect(w * x, h * y, 3, 6);
    }
  });

  const vanlife = make('vanlife', (ctx, w, h) => {
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.rotate(-0.06 + jitter(9, 0.04));
    ctx.fillStyle = ink;
    ctx.font = `900 italic ${Math.round(h * 0.26)}px "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('VAN', 0, -h * 0.18);
    ctx.fillText('LIFE', 0, h * 0.14);
    ctx.restore();
    doodleStroke(
      ctx,
      (c) => {
        c.moveTo(w * 0.14, h * 0.86);
        for (let i = 0; i <= 6; i++) {
          c.lineTo(w * 0.14 + (w * 0.72 * i) / 6, h * 0.86 + Math.sin((i / 6) * Math.PI * 2) * h * 0.04);
        }
      },
      mustard,
      6,
      10,
    );
  });

  return { wave, sun, cactus, vanlife };
}

/* ============================== texTapestry（3.4-10 挂毯几何纹样） ============================== */

/** 挂毯贴图：奶油底 + 菱形格纹（芥末/青绿/赭交替）+ 底缘流苏短线。 */
export function createTapestryTexture(assets: SharedAssets, id: string, cream: string, mustard: string, teal: string, rust: string): THREE.Texture {
  return assets.texture(`${id}/tex-tapestry`, () =>
    paintCanvasTexture(`${id}/tex-tapestry`, 128, 96, (ctx, w, h) => {
      ctx.fillStyle = cream;
      ctx.fillRect(0, 0, w, h);
      const palette = [mustard, teal, rust];
      const cell = 24;
      // 菱形格纹（两排错位）
      for (let row = 0; row < 2; row++) {
        for (let col = 0; col < 4; col++) {
          const cx = cell * (col + (row % 2 === 0 ? 0.5 : 1)) + cell * 0.5;
          const cy = h * 0.42 + row * h * 0.3;
          const r = cell * 0.42;
          ctx.fillStyle = palette[(row * 4 + col) % palette.length] ?? mustard;
          ctx.beginPath();
          ctx.moveTo(cx, cy - r);
          ctx.lineTo(cx + r, cy);
          ctx.lineTo(cx, cy + r);
          ctx.lineTo(cx - r, cy);
          ctx.closePath();
          ctx.fill();
          ctx.strokeStyle = 'rgba(255,250,238,0.75)';
          ctx.lineWidth = 2.5;
          ctx.stroke();
        }
      }
      // 上下织边（双色条）
      ctx.fillStyle = mustard;
      ctx.fillRect(0, 0, w, h * 0.08);
      ctx.fillStyle = teal;
      ctx.fillRect(0, h * 0.08, w, 3);
      ctx.fillStyle = rust;
      ctx.fillRect(0, h * 0.92, w, h * 0.08);
      // 流苏（底缘短线束）
      ctx.strokeStyle = 'rgba(193,86,74,0.9)';
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';
      for (let x = 4; x < w; x += 8) {
        ctx.beginPath();
        ctx.moveTo(x, h - 2);
        ctx.lineTo(x + jitter(x, 1.2), h + 6);
        ctx.stroke();
      }
    }),
  );
}

/* ============================== texWoodFloor oak（台面木纹，3.4 内饰） ============================== */

/** oak 亮橡木台面纹（同 classC drawWoodFloor 模式：条纹+年轮弧+板缝）。 */
export function createWoodCounterTexture(assets: SharedAssets, id: string, baseColor: string): THREE.Texture {
  return assets.texture(`${id}/tex-wood-counter`, () =>
    paintCanvasTexture(`${id}/tex-wood-counter`, 256, 256, (ctx, w, h) => {
      ctx.fillStyle = baseColor;
      ctx.fillRect(0, 0, w, h);
      const rows = 6;
      for (let r = 0; r < rows; r++) {
        const y = (h * r) / rows;
        ctx.fillStyle = r % 2 === 0 ? 'rgba(255,255,255,0.10)' : 'rgba(90,60,30,0.08)';
        ctx.fillRect(0, y, w, h / rows);
        ctx.strokeStyle = 'rgba(90,60,30,0.35)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
        const offset = ((r * 97) % 100) / 100;
        ctx.beginPath();
        ctx.arc(w * offset, y + h / rows / 2, (h / rows) * 0.32, Math.PI * 0.15, Math.PI * 0.85);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(w * offset, y);
        ctx.lineTo(w * offset, y + h / rows);
        ctx.stroke();
      }
    }),
  );
}
