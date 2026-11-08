// docs/01-整体架构.md §3.2 core/events.ts —— 轻量事件总线（state 变更分发）。T04 落点。
// 只做订阅/分发，不理解任何具体事件语义；首个使用方是 AppStateStore（core/state.ts）。
// 帧驱动纪律同全项目：事件同步分发、无任何 setTimeout/setInterval。

export type Unsubscribe = () => void;
export type EventListener<T> = (payload: T) => void;

/** 轻量发布/订阅总线：同型事件可多订阅者；emit 用订阅快照，防遍历中增删。 */
export class EventBus {
  private readonly listeners = new Map<string, Set<(payload: unknown) => void>>();

  /** 订阅；返回退订函数（T17 卸载编排/泄漏测试用）。 */
  on<T>(type: string, listener: EventListener<T>): Unsubscribe {
    let set = this.listeners.get(type);
    if (!set) {
      set = new Set();
      this.listeners.set(type, set);
    }
    // 运行期单次收敛到 unknown 形；调用侧保留完整载荷类型。
    set.add(listener as unknown as (payload: unknown) => void);
    return () => {
      this.off(type, listener);
    };
  }

  /** 退订。 */
  off<T>(type: string, listener: EventListener<T>): void {
    this.listeners.get(type)?.delete(listener as unknown as (payload: unknown) => void);
  }

  /** 同步分发；无订阅者即空操作。 */
  emit<T>(type: string, payload: T): void {
    const set = this.listeners.get(type);
    if (!set || set.size === 0) return;
    for (const listener of [...set]) listener(payload);
  }

  /** 指定事件的订阅数（调试/泄漏自检）。 */
  count(type: string): number {
    return this.listeners.get(type)?.size ?? 0;
  }

  /** 清空全部订阅（测试/销毁用）。 */
  clear(): void {
    this.listeners.clear();
  }
}
