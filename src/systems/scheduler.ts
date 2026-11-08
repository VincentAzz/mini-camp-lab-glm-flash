// docs/01-整体架构.md §3.2 systems/scheduler.ts —— EventScheduler：偶发动效随机排程（海鸟掠过/松鼠窜过…）；T15 落点。
// 契约（以源码为准）：systems/handles.ts ③ ScheduledEvent / ScheduledEventHandle / EventScheduler（§3.4-9
// 「平均间隔/概率/最短间隔，触发回调」）。Director 以类实例注入 SceneRuntime（§3.3.2），内容模块只经
// handles.ts 契约面调用 add()，禁止 import 本文件（§3.4「唯一交汇面」）。
// 参数定值：docs/05 §7.1.5 五事件表——海鸟 16s±6s / 松鼠 26s±10s / 纸巾 11s±4s / 光斑 9s±3s / 双闪 20s±8s；
// 海鸟与松鼠「仅 dawn/day/dusk（夜间归巢）」（§7.1.6 矩阵 night ✗）→ 本类提供夜间自动静默。
// 纪律（docs/05 §7.1.5 标题 + clock.ts 同源纪律）：帧驱动排程，严禁 setTimeout/setInterval——
//   Director 每帧 update(dt)（§3.5.2 ③「EventScheduler 偶发触发检查」），dt 与 RhythmClock.update 为同一帧
//   步长（Engine 单一 dt 源，engine.ts tick）；本类不读全局时钟、不起任何定时器。触发序列以注册序派生
//   mulberry32 种子（§3.3.2「同组合视觉可复现」纪律）：同帧序下确定，重进场景重排同序列。
import { hashString, mulberry32 } from '@/shared/rng';
import type {
  EventScheduler as EventSchedulerContract,
  ScheduledEvent,
  ScheduledEventHandle,
} from '@/systems/handles';

/* ============================== 预置事件参数（docs/05 §7.1.5 五行） ============================== */

/** 事件节奏参数（ScheduledEvent 排程字段子集；预置表与 createScheduledEvent 共用）。 */
export interface EventTimingParams {
  /** 平均间隔 s（docs/05 §7.1.5：海鸟 16 / 松鼠 26 / 纸巾 11 / 光斑 9 / 双闪 20） */
  readonly meanIntervalS: number;
  /** 随机窗 ±s（±6 / ±10 / ±4 / ±3 / ±8） */
  readonly jitterS?: number;
  /** 最短间隔 s（下限保护；五事件表未定值则不设） */
  readonly minIntervalS?: number;
  /** 触发概率 0..1（默认 1） */
  readonly probability?: number;
}

/**
 * 单个预置事件参数（docs/05 §7.1.5 逐行；pattern 为「表现实现」列定值，供场景动画按 RhythmClock
 * 相位消费——场景模块按纪律不 import 本文件，落地时以 docs/05 §7.1.5 为准内联同值，本表为 T41 调参基准）。
 */
export interface ScheduledEventPreset extends EventTimingParams {
  readonly id: 'seagull' | 'squirrel' | 'napkinGust' | 'lightspotChirp' | 'signDoubleFlash';
  readonly label: string;
  readonly sceneId: 'seacliff' | 'pineforest' | 'servicearea';
  /** jitterS 在五事件表全部给出，预置档收窄为必填 */
  readonly jitterS: number;
  /** 夜间静默（true = 仅 dawn/day/dusk 触发；§7.1.5-1/2「夜间归巢」） */
  readonly nightSilent: boolean;
  /** docs/05 §7.1.5 行引用 */
  readonly docRow: string;
  /** 表现节奏参数（场景动画按 RhythmClock 相位实现，docs/05 §7.1.5「表现实现」列） */
  readonly pattern: Readonly<Record<string, number>>;
}

/**
 * 五事件预置参数（docs/05 §7.1.5 定值逐字）。
 * 纪律：minIntervalS/probability 原文未给值 → 不擅自设值（契约可选项缺省）。
 */
export const SCHEDULED_EVENT_PRESETS = {
  seagull: {
    id: 'seagull',
    label: '海鸟掠过（海崖）',
    sceneId: 'seacliff',
    meanIntervalS: 16,
    jitterS: 6,
    nightSilent: true,
    docRow: 'docs/05 §7.1.5-1',
    pattern: {
      countMin: 1, countMax: 3,           // 每次 1~3 只
      flightSpeedMS: 1.8,                 // 贝塞尔路径速 1.8m/s
      flightHeightMinM: 1.6, flightHeightMaxM: 2.4, // 横越海面上空 h1.6~2.4m
      flapHz: 3.2,                        // 扑翼 3.2Hz 与滑翔交替
      flapAmplitudeRad: 0.6981,           // ±40°
    },
  },
  squirrel: {
    id: 'squirrel',
    label: '松鼠窜过（松林）',
    sceneId: 'pineforest',
    meanIntervalS: 26,
    jitterS: 10,
    nightSilent: true,
    docRow: 'docs/05 §7.1.5-2',
    pattern: {
      runDistanceMinM: 2, runDistanceMaxM: 3, // 地面样条 2~3m
      runDurationS: 2.2,                  // /2.2s
      pauseS: 0.4,                        // 中段可停 0.4s
      bounceHz: 8,                        // 奔跑 8Hz 体颠+尾波
    },
  },
  napkinGust: {
    id: 'napkinGust',
    label: '纸巾阵风轻掀（海崖）',
    sceneId: 'seacliff',
    meanIntervalS: 11,
    jitterS: 4,
    nightSilent: false,                   // 风事件无夜间限制（§7.1.5-3）
    docRow: 'docs/05 §7.1.5-3',
    pattern: {
      windFactorMul: 2.2,                 // 触发时该 ClothHandle 局部 windFactor ×2.2
      decayS: 0.8,                        // 0.8s 内衰减回 1
    },
  },
  lightspotChirp: {
    id: 'lightspotChirp',
    label: '光斑鸟鸣跳动（松林）',
    sceneId: 'pineforest',
    meanIntervalS: 9,
    jitterS: 3,
    nightSilent: false,                   // §7.1.5-4 未限夜间；夜间光斑强度由 §7.1.6 光斑行另行归零
    docRow: 'docs/05 §7.1.5-4',
    pattern: {
      burstWindowS: 0.9,                  // burst 窗 0.9s
      pulseHz: 4,                         // ~4Hz 快脉冲
      pulseCountMin: 3, pulseCountMax: 5, // 窗内 3~5 个
    },
  },
  signDoubleFlash: {
    id: 'signDoubleFlash',
    label: '招牌双闪（服务区）',
    sceneId: 'servicearea',
    meanIntervalS: 20,
    jitterS: 8,
    nightSilent: false,                   // 夜间商业灯为主角（§7.1.6），双闪不受限
    docRow: 'docs/05 §7.1.5-5',
    pattern: {
      flashWindowS: 0.3,                  // 0.3s 内两短闪
      flashCount: 2,                      // 微闪之外点缀
    },
  },
} as const satisfies Readonly<Record<string, ScheduledEventPreset>>;

/** 预置表数组形式（遍历/核验用；顺序 = §7.1.5 行序）。 */
export const SCHEDULED_EVENT_PRESET_LIST: readonly ScheduledEventPreset[] = Object.values(
  SCHEDULED_EVENT_PRESETS,
);

/** 由预置节奏参数 + 场景侧 fire() 组装契约事件（core 层组装/测试用）。 */
export function createScheduledEvent(timing: EventTimingParams, fire: () => void): ScheduledEvent {
  return {
    meanIntervalS: timing.meanIntervalS,
    jitterS: timing.jitterS,
    minIntervalS: timing.minIntervalS,
    probability: timing.probability,
    fire,
  };
}

/* ============================== EventScheduler 实现 ============================== */

/** add() 扩展选项（可选第二参数；契约 add(event) 只传事件时可赋值性不受影响）。 */
export interface ScheduledEventOptions {
  /**
   * 夜间静默（true = 仅 dawn/day/dusk 触发，docs/05 §7.1.5-1/2）。
   * 事件对象携带同名字段亦可（结构子类型直传，无需改动 handles.ts 契约）；本选项优先。
   */
  readonly nightSilent?: boolean;
}

/** 事件对象级夜间静默标记（ScheduledEvent 契约不含此字段，运行期按鸭子类型读取）。 */
export type NightSilentScheduledEvent = ScheduledEvent & { readonly nightSilent?: boolean };

/** 默认随机种子（同帧序触发序列跨会话可复现，§3.3.2 纪律）。 */
const DEFAULT_SCHEDULER_SEED = 'event-scheduler';

interface EventRecord {
  readonly event: ScheduledEvent;
  readonly nightSilent: boolean;
  readonly rng: () => number;
  readonly serial: number;
  /** 距下次触发的倒计时 s */
  timerS: number;
}

/**
 * EventScheduler：偶发动效随机排程器（§3.4-9；T15）。
 * 平均间隔 + 随机窗（±jitterS 均匀分布）+ 最短间隔下限 + 触发概率，到点即调 fire()；
 * 夜间自动静默：setNightSilence(true) 后 nightSilent 事件倒计时冻结（海鸟/松鼠「夜间归巢」，
 * 恢复后接续原节奏），其余事件（纸巾/光斑/双闪）不受影响。
 * 严禁 setTimeout/setInterval：唯一推进口是 Director 每帧 update(dt)（dt 与 RhythmClock 同源）。
 */
export class EventScheduler implements EventSchedulerContract {
  private readonly records: EventRecord[] = [];
  private readonly seedKey: string;
  private serial = 0;
  private nightSilence = false;

  /** seed 决定触发序列（默认固定种子 → 同帧序下跨会话一致）。 */
  constructor(seed: string | number = DEFAULT_SCHEDULER_SEED) {
    this.seedKey = typeof seed === 'string' ? seed : `#${seed >>> 0}`;
  }

  /**
   * 注册触发项（§3.4-9；返回可取消句柄）。参数越界立即抛错（尽早暴露，同 Registry/RhythmClock 纪律）。
   * options.nightSilent / event.nightSilent（鸭子类型）二选一标记夜间静默；同时给出时 options 优先。
   */
  add(event: ScheduledEvent, options?: ScheduledEventOptions): ScheduledEventHandle {
    const serial = this.serial;
    if (!(event.meanIntervalS > 0) || !Number.isFinite(event.meanIntervalS)) {
      throw new RangeError(`[scheduler] 事件#${serial} meanIntervalS 必须为正有限数：${event.meanIntervalS}`);
    }
    if (event.jitterS !== undefined && !(event.jitterS >= 0)) {
      throw new RangeError(`[scheduler] 事件#${serial} jitterS 不得为负：${event.jitterS}`);
    }
    if (event.minIntervalS !== undefined && !(event.minIntervalS >= 0)) {
      throw new RangeError(`[scheduler] 事件#${serial} minIntervalS 不得为负：${event.minIntervalS}`);
    }
    if (event.probability !== undefined && !(event.probability > 0 && event.probability <= 1)) {
      throw new RangeError(`[scheduler] 事件#${serial} probability 须在 (0,1]：${event.probability}`);
    }
    const nightSilent = options?.nightSilent ?? (event as NightSilentScheduledEvent).nightSilent ?? false;
    const rng = mulberry32(hashString(`scheduler:${this.seedKey}:${serial}`));
    const record: EventRecord = { event, nightSilent, rng, serial, timerS: 0 };
    record.timerS = this.drawInterval(event, rng); // 首次触发也走完整间隔（场景装配后不即刻抢戏）
    this.records.push(record);
    this.serial += 1;

    let cancelled = false;
    return {
      cancel: (): void => {
        if (cancelled) return;
        cancelled = true;
        const index = this.records.indexOf(record);
        if (index >= 0) this.records.splice(index, 1);
      },
    };
  }

  /**
   * 每帧推进（§3.5.2 ③）：倒计时取自与 RhythmClock 同源的帧步长，到点掷概率、调 fire()、重排下一个完整间隔。
   * dt ≤ 0 忽略（节奏源只前进，与 RhythmClock.update 同纪律）。
   */
  update(dt: number): void {
    if (!(dt > 0)) return;
    for (const record of this.records) {
      if (record.nightSilent && this.nightSilence) continue; // 夜间静默：倒计时冻结
      record.timerS -= dt;
      if (record.timerS > 0) continue;
      const probability = record.event.probability ?? 1;
      if (probability >= 1 || record.rng() < probability) {
        try {
          record.event.fire();
        } catch (err) {
          // 偶发回调异常不冲垮帧循环（§3.5.2 ③ 公共系统阶段）；排程保留以便定位
          console.error(`[scheduler] 事件#${record.serial} fire() 抛错（排程继续）`, err);
        }
      }
      // 重排下一个完整间隔；本次到点的残余负值并入下一次（长程平均间隔精确收敛于 meanIntervalS）
      record.timerS = this.drawInterval(record.event, record.rng) + Math.min(record.timerS, 0);
    }
  }

  /**
   * 夜间自动静默开关：Director 在时间切换/首装按 state.time === 'night' 驱动（过渡中点切换，§3.5.3）。
   * true 时 nightSilent 事件（海鸟/松鼠）倒计时冻结；纸巾/光斑/双闪照常。
   */
  setNightSilence(active: boolean): void {
    this.nightSilence = active;
  }

  /** 当前是否处于夜间静默。 */
  get isNightSilence(): boolean {
    return this.nightSilence;
  }

  /** 在册事件数。 */
  get size(): number {
    return this.records.length;
  }

  /** 夜间静默下被挂起的注册项数（T17/T41 观测用）。 */
  get suspendedCount(): number {
    return this.nightSilence ? this.records.filter((r) => r.nightSilent).length : 0;
  }

  /** 全部注销（场景卸载兜底；常规路径逐 handle.cancel，T17 泄漏核对）。 */
  clear(): void {
    this.records.length = 0;
  }

  /** 抽取下一个间隔：meanIntervalS ± jitterS 均匀分布，minIntervalS 下限保护。 */
  private drawInterval(event: ScheduledEvent, rng: () => number): number {
    const jitter = event.jitterS ?? 0;
    let interval = event.meanIntervalS + (rng() * 2 - 1) * jitter;
    if (event.minIntervalS !== undefined) interval = Math.max(interval, event.minIntervalS);
    return Math.max(interval, 0);
  }
}
