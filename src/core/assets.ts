// docs/01-整体架构.md §3.4 #10 / §3.7 #1 —— SharedAssets：程序化几何/贴图共享缓存（引用计数）。
// 落点说明：01 §3.2 把缓存基建分置 tex/canvasTex.ts（贴图缓存基建）与 geom/（几何工厂），
// 本文件在 core/ 提供注入给内容模块的门面（§3.3.2 SceneBuildContext.assets / VehicleBuildContext.assets，
// §3.5.3 场景/车型卸载时「assets 引用计数释放」）。
// 引用计数纪律：构建期 acquire（同 key 命中即共享 +1），卸载期 release；归零即 dispose。
import * as THREE from 'three';
import * as tex from '@/tex/canvasTex';

// ---------------------------------------------------------------------------
// 几何缓存
// ---------------------------------------------------------------------------

export class GeometryCache {
  private items = new Map<string, { geometry: THREE.BufferGeometry; refs: number }>();

  /** 取用（未命中则用工厂现场生成并登记）；同 key 全局共享，切换不重复建模（§3.7 #1）。 */
  acquire<T extends THREE.BufferGeometry>(key: string, factory: () => T): T {
    const hit = this.items.get(key);
    if (hit) {
      hit.refs += 1;
      return hit.geometry as T;
    }
    const geometry = factory();
    geometry.name = key;
    this.items.set(key, { geometry, refs: 1 });
    return geometry;
  }

  /** 释放一个引用；归零 dispose 并移出缓存。 */
  release(key: string): number {
    const hit = this.items.get(key);
    if (!hit) {
      console.warn(`[assets] release 未登记的 geometry key=${key}`);
      return 0;
    }
    hit.refs = Math.max(0, hit.refs - 1);
    if (hit.refs === 0) {
      hit.geometry.dispose();
      this.items.delete(key);
      return 0;
    }
    return hit.refs;
  }

  get(key: string): THREE.BufferGeometry | undefined {
    return this.items.get(key)?.geometry;
  }

  refCount(key: string): number {
    return this.items.get(key)?.refs ?? 0;
  }

  stats(): { count: number; refs: number } {
    let refs = 0;
    for (const item of this.items.values()) refs += item.refs;
    return { count: this.items.size, refs };
  }

  /** 全量收尾（仅整体销毁时调用；逐场景卸载请走 release）。 */
  disposeAll(): void {
    for (const item of this.items.values()) item.geometry.dispose();
    this.items.clear();
  }
}

// ---------------------------------------------------------------------------
// 贴图缓存门面（缓存基建按 §3.2 落在 tex/canvasTex.ts，此处收敛成 SharedAssets 门面）
// ---------------------------------------------------------------------------

export class TextureCache {
  acquireCanvas(key: string, w: number, h: number, draw: tex.CanvasDrawFn, opts: tex.CanvasTextureOptions = {}): THREE.CanvasTexture {
    return tex.createCanvasTexture(key, w, h, draw, opts);
  }

  acquireSvg(key: string, w: number, h: number, buildSvg: tex.SvgBuilderFn, opts: tex.CanvasTextureOptions = {}): THREE.CanvasTexture {
    return tex.createSvgTexture(key, w, h, buildSvg, opts);
  }

  acquireFactory(key: string, factory: tex.TextureFactoryFn, opts: tex.CanvasTextureOptions = {}): THREE.Texture {
    return tex.getOrCreateTexture(key, factory, opts);
  }

  release(key: string): number {
    return tex.releaseTexture(key);
  }

  get(key: string): THREE.Texture | undefined {
    return tex.getTexture(key);
  }

  refCount(key: string): number {
    return tex.textureRefCount(key);
  }

  preloadAll(): Promise<void> {
    return tex.preloadAll();
  }

  stats(): tex.TextureCacheStats {
    return tex.textureCacheStats();
  }
}

// ---------------------------------------------------------------------------
// SharedAssets
// ---------------------------------------------------------------------------

export interface SharedAssetsStats {
  geometry: { count: number; refs: number };
  texture: tex.TextureCacheStats;
}

export class SharedAssets {
  readonly geometry = new GeometryCache();
  readonly textures = new TextureCache();

  /** SVG 等异步贴图装配等待口：场景装配前 await（§5.4 ③）。 */
  preloadAll(): Promise<void> {
    return this.textures.preloadAll();
  }

  stats(): SharedAssetsStats {
    return { geometry: this.geometry.stats(), texture: this.textures.stats() };
  }

  /** 整体收尾（Director 全量销毁时）：非常驻资源全部释放；常驻层（ramp 等）保留。 */
  disposeTransient(): void {
    this.geometry.disposeAll();
    tex.disposeTransientTextures();
  }
}

/** Director 初始化期创建一份，经 SceneBuildContext/VehicleBuildContext.assets 注入内容模块。 */
export function createSharedAssets(): SharedAssets {
  return new SharedAssets();
}
