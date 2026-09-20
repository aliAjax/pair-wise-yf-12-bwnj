// 应急补给批次闭环：校验建批、发车、逐站签收 / 冻结。
// 本文件只处理纯业务规则，不直接读写 localStorage 与页面状态。

export const SAFETY_LINE = 12000; // 库存安全线（L），高于此线不允许进入应急批次

export const FUEL_TYPES = ["92#汽油", "95#汽油", "0#柴油", "-10#柴油"] as const;

export const BATCH_STATUSES = ["待发车", "运输中", "已冻结", "已完成"] as const;
export type BatchStatus = (typeof BATCH_STATUSES)[number];

// 占用区域名额的“未结束批次”状态
const OPEN_STATUSES: readonly BatchStatus[] = ["待发车", "运输中", "已冻结"];

export interface StationLike {
  id: string;
  station: string;
  area: string;
  stock: number;
  status: string;
}

export interface BatchStop {
  stationId: string;
  station: string;
  amount: number;
  signed: boolean;
  signedAt: string | null;
  stockBefore: number | null;
}

export interface SupplyBatch {
  id: string;
  area: string;
  fuelType: string;
  quota: number;
  status: BatchStatus;
  stops: BatchStop[];
  createdAt: string;
  dispatchedAt: string | null;
  freezeReason: string | null;
}

export interface DraftStation {
  id: string;
  amount: number;
}

export interface Draft {
  stations: StationLike[];
  amounts: Record<string, number>;
  area: string;
  fuelType: string;
  quota: number;
}

export interface DraftCheck {
  ok: boolean;
  errors: string[];
  ordered: DraftStation[]; // 按到站顺序
  total: number;
}

/** 建批前的整批校验：任一规则不满足都整批拒绝，页面与本地数据不变。 */
export function validateDraft(draft: Draft, batches: SupplyBatch[]): DraftCheck {
  const errors: string[] = [];
  const selected = draft.stations;

  if (selected.length === 0) {
    errors.push("请至少选择一个营业中站点。");
  }

  // 同一区域
  const area = draft.area;
  if (!area) {
    errors.push("批次必须归属一个区域。");
  } else if (selected.some((station) => station.area !== area)) {
    errors.push("同一批次只能选择同一区域的站点。");
  }

  // 营业中
  const notOpen = selected.filter((station) => station.status !== "营业中");
  if (notOpen.length > 0) {
    errors.push(`仅可选择营业中站点：${notOpen.map((s) => s.station).join("、")} 当前非营业中。`);
  }

  // 库存必须不高于安全线（高于安全线整批拒绝）
  const aboveLine = selected.filter((station) => station.stock > SAFETY_LINE);
  if (aboveLine.length > 0) {
    errors.push(
      `以下站点库存高于安全线 ${SAFETY_LINE.toLocaleString()}L，整批拒绝：${aboveLine
        .map((s) => `${s.station}（${s.stock.toLocaleString()}L）`)
        .join("、")}。`
    );
  }

  // 同区域已有未结束批次
  if (area && batches.some((batch) => batch.area === area && OPEN_STATUSES.includes(batch.status))) {
    errors.push(`区域【${area}】已有未结束的应急批次，名额未释放，不能再建批次。`);
  }

  if (!draft.fuelType) {
    errors.push("请选择补给油品。");
  }
  if (!Number.isFinite(draft.quota) || draft.quota <= 0) {
    errors.push("总额度必须为大于 0 的数字。");
  }

  // 逐站补给量
  const ordered: DraftStation[] = selected.map((station) => ({
    id: station.id,
    amount: Number(draft.amounts[station.id] ?? 0)
  }));
  for (const item of ordered) {
    if (!Number.isFinite(item.amount) || item.amount <= 0) {
      const station = selected.find((s) => s.id === item.id);
      errors.push(`站点【${station?.station ?? item.id}】的补给量必须大于 0。`);
    }
  }

  const total = ordered.reduce((sum, item) => sum + (item.amount > 0 ? item.amount : 0), 0);
  if (Number.isFinite(draft.quota) && draft.quota > 0 && total > draft.quota) {
    errors.push(`累计补给量 ${total.toLocaleString()}L 已超过总额度 ${draft.quota.toLocaleString()}L，整批拒绝。`);
  }

  return { ok: errors.length === 0, errors, ordered, total };
}

/** 用通过校验的草稿创建待发车批次（不改站点库存）。 */
export function buildBatch(draft: Draft, check: DraftCheck, now: Date = new Date()): SupplyBatch {
  return {
    id: crypto.randomUUID(),
    area: draft.area,
    fuelType: draft.fuelType,
    quota: draft.quota,
    status: "待发车",
    createdAt: now.toISOString(),
    dispatchedAt: null,
    freezeReason: null,
    stops: check.ordered.map((item) => {
      const station = draft.stations.find((s) => s.id === item.id);
      return {
        stationId: item.id,
        station: station?.station ?? item.id,
        amount: item.amount,
        signed: false,
        signedAt: null,
        stockBefore: null
      };
    })
  };
}

/** 发车：待发车 -> 运输中。 */
export function dispatchBatch(batch: SupplyBatch, now: Date = new Date()): SupplyBatch {
  if (batch.status !== "待发车") return batch;
  return { ...batch, status: "运输中", dispatchedAt: now.toISOString() };
}

export interface SignResult {
  batch: SupplyBatch;
  /** 本次成功签收的站点；冻结或无法推进时为 null */
  signedStop: BatchStop | null;
  /** 实际入账的补给量（冻结时为 0） */
  delivered: number;
  frozen: boolean;
  message: string;
}

/**
 * 按到站顺序签收下一站：
 * - 该站签收前已进入库存紧张 -> 立即冻结批次，保留此前签收，后续站点不得跳过；
 * - 否则正常签收并补给入库；全部签收完 -> 已完成（释放区域名额）。
 * stationLookup 返回当前站点实时状态；找不到站点按异常处理，同样冻结批次。
 */
export function signNextStop(
  batch: SupplyBatch,
  stationLookup: (id: string) => StationLike | undefined,
  now: Date = new Date()
): SignResult {
  if (batch.status !== "运输中") {
    return { batch, signedStop: null, delivered: 0, frozen: false, message: "只有运输中的批次可以签收。" };
  }

  const next = batch.stops.find((stop) => !stop.signed);
  if (!next) {
    return { batch, signedStop: null, delivered: 0, frozen: false, message: "该批次已全部签收。" };
  }

  const station = stationLookup(next.stationId);

  // 站点找不到（已删除）或签收前进入库存紧张：立即冻结，保留此前签收
  if (!station) {
    const frozen: SupplyBatch = {
      ...batch,
      status: "已冻结",
      freezeReason: `站点【${next.station}】在签收前已不存在，批次冻结，后续站点不得跳过。`
    };
    return { batch: frozen, signedStop: null, delivered: 0, frozen: true, message: frozen.freezeReason! };
  }

  if (station.status === "库存紧张") {
    const frozen: SupplyBatch = {
      ...batch,
      status: "已冻结",
      freezeReason: `站点【${station.station}】签收前进入库存紧张，批次立即冻结；此前签收已保留，后续站点不得跳过。`
    };
    return { batch: frozen, signedStop: null, delivered: 0, frozen: true, message: frozen.freezeReason! };
  }

  // 正常签收：补给量入库
  const stops = batch.stops.map((stop) =>
    stop.stationId === next.stationId
      ? { ...stop, signed: true, signedAt: now.toISOString(), stockBefore: station.stock }
      : stop
  );
  const allSigned = stops.every((stop) => stop.signed);
  const updated: SupplyBatch = {
    ...batch,
    stops,
    status: allSigned ? "已完成" : "运输中",
    freezeReason: allSigned ? null : batch.freezeReason
  };

  return {
    batch: updated,
    signedStop: stops.find((stop) => stop.stationId === next.stationId) ?? null,
    delivered: next.amount,
    frozen: false,
    message: allSigned
      ? `全部站点签收完毕，区域【${batch.area}】名额已释放。`
      : `【${station.station}】签收成功，入库 ${next.amount.toLocaleString()}L。`
  };
}

/** 未结束（占用区域名额）的批次。 */
export function isOpenBatch(batch: SupplyBatch): boolean {
  return OPEN_STATUSES.includes(batch.status);
}
