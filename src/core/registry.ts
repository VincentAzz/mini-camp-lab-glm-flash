// docs/01-整体架构.md §3.2/§3.3.1 core/registry.ts —— 泛型 Registry<T>：register/get/list。T04 落点。
// 四套注册表（场景/车型/时间/天气）互相独立：各自拥有独立 entry 类型与 registry 实例（§3.3 总则）。

/** 注册表条目基接口（§3.3.1 逐字）。 */
export interface RegistryEntry {
  readonly id: string; // 稳定标识：'seacliff' / 'classC' / 'dusk' / 'rain'
  readonly label: string; // UI 展示名（六.2 组合标题「场景 · 车型 · 时间 · 天气」）
  readonly isDefault?: boolean; // 默认档：海崖/C型/黄昏/晴朗（原文 L3、L151）
}

/**
 * 泛型注册表（§3.3.1 逐字）。
 * list() 保持注册顺序——UI 分段按钮按此渲染（六.1）。
 */
export class Registry<T extends RegistryEntry> {
  private readonly byId = new Map<string, T>();
  private readonly ordered: T[] = [];

  /** 登记条目；重复 id 立即抛错（尽早暴露）。 */
  register(entry: T): void {
    if (this.byId.has(entry.id)) {
      throw new Error(`[registry] 重复注册 id '${entry.id}'（§3.3.1：重复 id 立即抛错）`);
    }
    this.byId.set(entry.id, entry);
    this.ordered.push(entry);
  }

  /** 取条目；未登记抛错并列出可用 id。 */
  get(id: string): T {
    const found = this.byId.get(id);
    if (!found) {
      const available = this.ordered.map((entry) => entry.id).join(', ');
      throw new Error(`[registry] 未登记 id '${id}'；可用：${available}`);
    }
    return found;
  }

  /** 按注册顺序返回条目（拷贝，防外部改动顺序）。 */
  list(): readonly T[] {
    return this.ordered.slice();
  }
}
