// docs/01-整体架构.md §3.2 core/state.ts —— AppState：scene/vehicle/time/weather 四维当前值 + 变更事件。T04 落点。
// 四维 id 集中在 core 定义：四套注册表之间零 import（§3.3.6 独立性核对表），跨维度取 id 一律经 core。
import { EventBus, type Unsubscribe } from '@/core/events';

/**
 * 四维 id：已知档位以字面量联合给出（编译期提示/判据），并放行 (string & {})
 * 使「新增档位只需新增预设数据 + registry 一行」（§3.3.4 注记）无需改 core。
 */
export type SceneId = 'seacliff' | 'pineforest' | 'wasteland' | 'servicearea' | (string & {});
export type VehicleId =
  | 'classC'
  | 'classA'
  | 'trailerRig' // 决策 D4：皮卡+拖挂注册为单一模块
  | 'classB'
  | 'overlandTruck'
  | (string & {});
export type TimeId = 'dawn' | 'day' | 'dusk' | 'night' | (string & {});
export type WeatherId = 'clear' | 'cloudy' | 'rain' | 'fog' | 'snow' | (string & {});

/** 四维当前值。 */
export interface AppState {
  readonly scene: SceneId;
  readonly vehicle: VehicleId;
  readonly time: TimeId;
  readonly weather: WeatherId;
}

/** 默认组合（§3.3.1 isDefault 注 + §3.5.1 director.applyState({...})：海崖 · C型 · 黄昏 · 晴朗）。 */
export const DEFAULT_STATE: AppState = {
  scene: 'seacliff',
  vehicle: 'classC',
  time: 'dusk',
  weather: 'clear',
};

export type AppStateKey = keyof AppState; // 'scene' | 'vehicle' | 'time' | 'weather'

/** state 变更事件名（本总线唯一事件；载荷 AppStateChangeEvent）。 */
export const STATE_CHANGED = 'state:changed';

/** 变更事件载荷：单维 from→to + 变更后的完整四维。 */
export interface AppStateChangeEvent {
  readonly key: AppStateKey;
  readonly from: string;
  readonly to: string;
  readonly state: AppState;
}

/**
 * 四维状态持有者：set/apply 去重后经自有 EventBus 广播 'state:changed'。
 * Director 订阅做切换编排（§3.5.3 四条更新路径），UI 经 set() 下发分段按钮选择（六.1）。
 */
export class AppStateStore {
  /** 事件总线（Director/UI 亦可直接订阅 STATE_CHANGED）。 */
  readonly events = new EventBus();

  private current: AppState;

  constructor(initial: AppState = DEFAULT_STATE) {
    this.current = { ...initial };
  }

  /** 当前四维快照（不可变视图；每次变更生成新对象）。 */
  get state(): AppState {
    return this.current;
  }

  /** 读单维。 */
  get<K extends AppStateKey>(key: K): AppState[K] {
    return this.current[key];
  }

  /** 单维变更；与当前值相同则 no-op 返回 false，否则更新并广播。 */
  set<K extends AppStateKey>(key: K, id: AppState[K]): boolean {
    const from = this.current[key];
    if (from === id) return false;
    // key ∈ AppStateKey，展开写入恒安全（收敛为 AppState 的单点 cast）。
    this.current = { ...this.current, [key]: id } as AppState;
    this.events.emit<AppStateChangeEvent>(STATE_CHANGED, {
      key,
      from,
      to: id,
      state: this.current,
    });
    return true;
  }

  /** 批量变更（§3.5.1 applyState 整组下发）；返回实际发生变化的维度数。 */
  apply(patch: Partial<AppState>): number {
    let changed = 0;
    (Object.keys(patch) as AppStateKey[]).forEach((key) => {
      const next = patch[key];
      if (next !== undefined && this.set(key, next)) changed += 1;
    });
    return changed;
  }

  /** 订阅四维变更；返回退订函数。 */
  onChange(listener: (event: AppStateChangeEvent) => void): Unsubscribe {
    return this.events.on<AppStateChangeEvent>(STATE_CHANGED, listener);
  }
}
