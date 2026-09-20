<script setup lang="ts">
import { computed, reactive, ref } from "vue";

type Field = {
  key: string;
  label: string;
  type?: "number" | "date" | "select";
  options?: readonly string[];
};

type RecordItem = {
  id: string;
  status: string;
  notes: string;
  createdAt: string;
  [key: string]: string | number;
};

const project = {
  "number": 21,
  "folder": "hxwl/frontend/hxwlfront-21",
  "framework": "vue",
  "title": "油站网点地图管理",
  "subtitle": "维护油站位置、营业状态和库存摘要。",
  "industry": "石油",
  "stack": [
    "Vue3",
    "Vite",
    "TypeScript",
    "Element Plus",
    "Leaflet"
  ],
  "storageKey": "hxwlfront-21-station-map",
  "formTitle": "新增油站",
  "primaryAction": "保存油站",
  "entityLabel": "油站",
  "statuses": [
    "营业中",
    "暂停营业",
    "库存紧张"
  ],
  "filters": [
    "全部区域",
    "东区",
    "西区",
    "机场线"
  ],
  "fields": [
    {
      "key": "station",
      "label": "油站名称"
    },
    {
      "key": "area",
      "label": "区域",
      "type": "select",
      "options": [
        "东区",
        "西区",
        "机场线"
      ]
    },
    {
      "key": "stock",
      "label": "库存摘要L",
      "type": "number"
    },
    {
      "key": "manager",
      "label": "负责人"
    }
  ],
  "records": [
    {
      "station": "东区一站",
      "area": "东区",
      "stock": 36000,
      "manager": "刘站长",
      "status": "营业中",
      "notes": "库存正常"
    },
    {
      "station": "机场快线站",
      "area": "机场线",
      "stock": 9000,
      "manager": "王站长",
      "status": "库存紧张",
      "notes": "柴油待补"
    },
    {
      "station": "西区一站",
      "area": "西区",
      "stock": 7600,
      "manager": "陈站长",
      "status": "营业中",
      "notes": "低于安全线，等待应急补给"
    },
    {
      "station": "西区二站",
      "area": "西区",
      "stock": 6800,
      "manager": "赵站长",
      "status": "营业中",
      "notes": "低于安全线，等待应急补给"
    }
  ],
  "metricLabels": [
    "油站数",
    "营业中",
    "库存紧张"
  ]
} as const;

const fields = project.fields as readonly Field[];
const statuses = [...project.statuses];
const areas = project.filters.slice(1);

// 应急补给批次：库存高于该安全线的站点不允许纳入批次
const SAFETY_STOCK_LINE = 10000;
const batchStorageKey = `${project.storageKey}-batches`;
const fuelTypes = ["92号汽油", "95号汽油", "0号柴油"];

type BatchStop = {
  stationId: string;
  planned: number;
  signed: boolean;
  signedAt: string | null;
  frozenHere: boolean;
};

type BatchStatus = "待发车" | "配送中" | "已冻结" | "已完成";

type SupplyBatch = {
  id: string;
  code: string;
  area: string;
  fuelType: string;
  quota: number;
  stops: BatchStop[];
  status: BatchStatus;
  createdAt: string;
  dispatchedAt: string | null;
  completedAt: string | null;
  freezeReason: string;
};

function createBlank() {
  return Object.fromEntries(fields.map((field) => [field.key, field.type === "number" ? 0 : ""]));
}

function loadRecords(): RecordItem[] {
  const raw = localStorage.getItem(project.storageKey);
  if (!raw) {
    return project.records.map((record, index) => ({
      ...record,
      id: `seed-${index + 1}`,
      createdAt: new Date(Date.now() - index * 86400000).toISOString()
    })) as RecordItem[];
  }
  try {
    return JSON.parse(raw) as RecordItem[];
  } catch {
    return [];
  }
}

function loadBatches(): SupplyBatch[] {
  const raw = localStorage.getItem(batchStorageKey);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as SupplyBatch[];
  } catch {
    return [];
  }
}

const records = ref<RecordItem[]>(loadRecords());
const batches = ref<SupplyBatch[]>(loadBatches());
const form = reactive<Record<string, string | number>>(createBlank());
const note = ref("");
const filter = ref(project.filters[0]);

const filteredRecords = computed(() => {
  if (filter.value.startsWith("全部")) return records.value;
  return records.value.filter((record) => Object.values(record).includes(filter.value));
});

const metrics = computed(() => {
  const total = records.value.length;
  const second = records.value.filter((record) => record.status === statuses[1]).length;
  const third = records.value.filter((record) => record.status === statuses[2]).length;
  const numberValues = records.value.flatMap((record) =>
    fields.filter((field) => field.type === "number").map((field) => Number(record[field.key] || 0))
  );
  const sum = numberValues.reduce((acc, value) => acc + value, 0);
  return [total, second || sum, third || Math.round(sum / Math.max(total, 1))];
});

const chartRows = computed(() => statuses.map((status) => ({
  status,
  value: records.value.filter((record) => record.status === status).length
})));

const maxChart = computed(() => Math.max(1, ...chartRows.value.map((row) => row.value)));

function persist() {
  localStorage.setItem(project.storageKey, JSON.stringify(records.value));
}

function persistBatches() {
  localStorage.setItem(batchStorageKey, JSON.stringify(batches.value));
}

function nextStatus(status: string) {
  const index = statuses.indexOf(status);
  return statuses[(index + 1) % statuses.length];
}

function primaryText(record: RecordItem) {
  const first = fields[0];
  const second = fields[1];
  return [record[first.key], record[second.key]].filter(Boolean).join(" / ") || project.entityLabel;
}

function submit() {
  records.value = [
    {
      ...form,
      id: crypto.randomUUID(),
      status: statuses[0],
      notes: note.value || "暂无备注",
      createdAt: new Date().toISOString()
    } as RecordItem,
    ...records.value
  ];
  Object.assign(form, createBlank());
  note.value = "";
  persist();
}

// ---------------- 应急补给批次闭环 ----------------

const batchArea = ref("");
const batchFuel = ref(fuelTypes[0]);
const batchQuota = ref(0);
const selectedIds = ref<string[]>([]);
const stopPlanned = reactive<Record<string, number>>({});
const batchError = ref("");
const actionMessage = ref("");

const stationById = computed(() => {
  const map = new Map<string, RecordItem>();
  records.value.forEach((record) => map.set(record.id, record));
  return map;
});

// 所选区域下的全部站点（含不可选的非营业站，置灰展示原因）
const areaStations = computed(() =>
  batchArea.value ? records.value.filter((record) => record.area === batchArea.value) : []
);

const selectedStops = computed(() =>
  selectedIds.value.map((id) => ({ id, planned: Number(stopPlanned[id] ?? 0) }))
);

const plannedTotal = computed(() =>
  selectedStops.value.reduce((sum, stop) => sum + (Number.isFinite(stop.planned) ? stop.planned : 0), 0)
);

const quotaNumber = computed(() => {
  const value = Number(batchQuota.value);
  return Number.isFinite(value) && value > 0 ? value : 0;
});

const remainingQuota = computed(() => quotaNumber.value - plannedTotal.value);

// 名额占用：非完成状态的批次均占用所在区域名额
const occupiedAreas = computed(() => {
  const set = new Set<string>();
  batches.value.forEach((batch) => {
    if (batch.status !== "已完成") set.add(batch.area);
  });
  return set;
});

function areaBusy(area: string) {
  return occupiedAreas.value.has(area);
}

function stationName(id: string) {
  return String(stationById.value.get(id)?.station ?? "已删除站点");
}

function stationStock(id: string) {
  return Number(stationById.value.get(id)?.stock || 0);
}

function isStationSelected(id: string) {
  return selectedIds.value.includes(id);
}

function onBatchAreaChange() {
  selectedIds.value = [];
  Object.keys(stopPlanned).forEach((key) => delete stopPlanned[key]);
  batchError.value = "";
}

function toggleStation(record: RecordItem) {
  if (record.status !== "营业中") return;
  const index = selectedIds.value.indexOf(record.id);
  if (index >= 0) {
    selectedIds.value.splice(index, 1);
    delete stopPlanned[record.id];
  } else {
    selectedIds.value.push(record.id);
    // 默认补足到安全线，可手动调整
    stopPlanned[record.id] = Math.max(0, SAFETY_STOCK_LINE - Number(record.stock || 0));
  }
  batchError.value = "";
}

function moveStop(index: number, delta: number) {
  const target = index + delta;
  const ids = selectedIds.value;
  if (target < 0 || target >= ids.length) return;
  const current = ids[index];
  ids[index] = ids[target];
  ids[target] = current;
}

function resetBatchForm() {
  batchArea.value = "";
  batchFuel.value = fuelTypes[0];
  batchQuota.value = 0;
  selectedIds.value = [];
  Object.keys(stopPlanned).forEach((key) => delete stopPlanned[key]);
  batchError.value = "";
}

// 登记批次：任一校验不通过都整批拒绝，页面与本地数据保持不变
function createBatch() {
  batchError.value = "";
  actionMessage.value = "";

  if (!batchArea.value) {
    batchError.value = "请先选择补给区域。";
    return;
  }
  if (areaBusy(batchArea.value)) {
    batchError.value = `${batchArea.value}已有未结束批次，整批拒绝，页面和本地数据未变更。`;
    return;
  }
  if (selectedIds.value.length === 0) {
    batchError.value = "请至少选择一个营业中站点。";
    return;
  }
  if (quotaNumber.value <= 0) {
    batchError.value = "请填写正数的总额度。";
    return;
  }

  const stops: BatchStop[] = [];
  let total = 0;
  for (const id of selectedIds.value) {
    const station = stationById.value.get(id);
    if (!station) {
      batchError.value = "选中站点不存在，整批拒绝，页面和本地数据未变更。";
      return;
    }
    if (station.area !== batchArea.value) {
      batchError.value = `站点「${station.station}」不属于${batchArea.value}，整批拒绝，页面和本地数据未变更。`;
      return;
    }
    if (station.status !== "营业中") {
      batchError.value = `站点「${station.station}」当前为「${station.status}」，仅限营业中站点，整批拒绝，页面和本地数据未变更。`;
      return;
    }
    if (Number(station.stock || 0) > SAFETY_STOCK_LINE) {
      batchError.value = `站点「${station.station}」库存 ${Number(station.stock).toLocaleString()}L 高于安全线 ${SAFETY_STOCK_LINE.toLocaleString()}L，整批拒绝，页面和本地数据未变更。`;
      return;
    }
    const planned = Number(stopPlanned[id]);
    if (!Number.isFinite(planned) || planned <= 0) {
      batchError.value = `站点「${station.station}」的补给量必须为正数，整批拒绝，页面和本地数据未变更。`;
      return;
    }
    total += planned;
    stops.push({ stationId: id, planned, signed: false, signedAt: null, frozenHere: false });
  }

  if (total > quotaNumber.value) {
    batchError.value = `累计补给量 ${total.toLocaleString()}L 超过总额度 ${quotaNumber.value.toLocaleString()}L，整批拒绝，页面和本地数据未变更。`;
    return;
  }

  const batch: SupplyBatch = {
    id: crypto.randomUUID(),
    code: `BC${Date.now().toString().slice(-8)}`,
    area: batchArea.value,
    fuelType: batchFuel.value,
    quota: quotaNumber.value,
    stops,
    status: "待发车",
    createdAt: new Date().toISOString(),
    dispatchedAt: null,
    completedAt: null,
    freezeReason: ""
  };
  batches.value.unshift(batch);
  persistBatches();
  resetBatchForm();
  actionMessage.value = `批次 ${batch.code} 登记成功，占用${batch.area}名额，可安排发车。`;
}

function firstPendingIndex(batch: SupplyBatch) {
  return batch.stops.findIndex((stop) => !stop.signed);
}

function freezeBatch(batch: SupplyBatch, reason: string) {
  batch.status = "已冻结";
  batch.freezeReason = reason;
  persistBatches();
  actionMessage.value = reason;
}

// 巡检批次的下一个待签收站：签收前进入库存紧张则立即冻结
function evaluateFreeze(batch: SupplyBatch, context: string): boolean {
  if (batch.status === "已冻结" || batch.status === "已完成") return false;
  const next = batch.stops.find((stop) => !stop.signed);
  if (!next) return false;
  const station = stationById.value.get(next.stationId);
  if (!station) {
    next.frozenHere = true;
    freezeBatch(batch, `${context}：待签收站点「${stationName(next.stationId)}」已不存在，批次冻结，此前签收保留，后续站点不得跳过。`);
    return true;
  }
  if (station.status === "库存紧张") {
    next.frozenHere = true;
    freezeBatch(batch, `${context}：站点「${station.station}」签收前进入库存紧张，批次已冻结，此前签收保留，后续站点不得跳过。`);
    return true;
  }
  return false;
}

// 站点状态变化（流转/删除）后巡检在途批次，changedStationId 存在时仅核验受影响站点
function checkActiveBatches(changedStationId?: string) {
  for (const batch of batches.value) {
    if (batch.status !== "配送中") continue;
    const next = batch.stops.find((stop) => !stop.signed);
    if (next && (!changedStationId || next.stationId === changedStationId)) {
      evaluateFreeze(batch, "状态巡检");
    }
  }
}

function dispatchBatch(batch: SupplyBatch) {
  actionMessage.value = "";
  if (batch.status !== "待发车") return;
  // 发车即首站签收前，先做一次冻结核验
  if (evaluateFreeze(batch, "发车核验")) return;
  batch.status = "配送中";
  batch.dispatchedAt = new Date().toISOString();
  persistBatches();
  actionMessage.value = `批次 ${batch.code} 已发车，请按到站顺序逐站签收。`;
}

function signStop(batch: SupplyBatch, index: number) {
  actionMessage.value = "";
  if (batch.status !== "配送中") return;
  if (index !== firstPendingIndex(batch)) return;

  const stop = batch.stops[index];
  const station = stationById.value.get(stop.stationId);
  if (!station || station.status === "库存紧张") {
    evaluateFreeze(batch, "签收核验");
    return;
  }
  if (station.status !== "营业中") {
    actionMessage.value = `站点「${station.station}」当前为「${station.status}」，暂无法签收。`;
    return;
  }

  stop.signed = true;
  stop.signedAt = new Date().toISOString();
  station.stock = Number(station.stock || 0) + stop.planned;
  persistBatches();
  persist();

  if (batch.stops.every((item) => item.signed)) {
    batch.status = "已完成";
    batch.completedAt = new Date().toISOString();
    persistBatches();
    actionMessage.value = `批次 ${batch.code} 全部签收完成，已释放${batch.area}名额。`;
    return;
  }
  actionMessage.value = `站点「${station.station}」签收成功，${stop.planned.toLocaleString()}L 已入库。`;
  // 核验下一站是否已在其签收前进入库存紧张
  evaluateFreeze(batch, "签收后核验");
}

function batchSignedTotal(batch: SupplyBatch) {
  return batch.stops.reduce((sum, stop) => sum + (stop.signed ? stop.planned : 0), 0);
}

function batchPlannedTotal(batch: SupplyBatch) {
  return batch.stops.reduce((sum, stop) => sum + stop.planned, 0);
}

function batchPercent(batch: SupplyBatch) {
  const total = batchPlannedTotal(batch);
  if (total <= 0) return 0;
  return Math.min(100, Math.round((batchSignedTotal(batch) / total) * 100));
}

type StopState = "done" | "current" | "locked" | "frozen";

function stopState(batch: SupplyBatch, index: number): StopState {
  const stop = batch.stops[index];
  if (stop.signed) return "done";
  if (batch.status === "已冻结" && stop.frozenHere) return "frozen";
  if (batch.status === "配送中" && index === firstPendingIndex(batch)) return "current";
  return "locked";
}

function stopStateLabel(state: StopState) {
  return { done: "已签收", current: "待签收（当前站）", locked: "顺序锁定", frozen: "冻结于本站" }[state];
}

function batchStatusClass(status: BatchStatus) {
  return {
    "待发车": "batch-pending",
    "配送中": "batch-live",
    "已冻结": "batch-frozen",
    "已完成": "batch-done"
  }[status];
}

function formatTime(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}

function flow(record: RecordItem) {
  record.status = nextStatus(record.status);
  persist();
  // 站点进入库存紧张可能触发在途批次冻结
  checkActiveBatches(record.id);
}

function remove(id: string) {
  records.value = records.value.filter((record) => record.id !== id);
  persist();
  checkActiveBatches(id);
}

// 刷新后保留状态，并对在途批次做一次幂等巡检
checkActiveBatches();
</script>

<template>
  <main class="app">
    <div class="shell">
      <header class="topbar">
        <div>
          <p class="eyebrow">{{ project.industry }}行业前端最小闭环</p>
          <h1>{{ project.title }}</h1>
          <p class="subtitle">{{ project.subtitle }}</p>
        </div>
        <div class="stack">
          <span v-for="item in project.stack" :key="item" class="tag">{{ item }}</span>
        </div>
      </header>

      <section class="metrics">
        <article v-for="(label, index) in project.metricLabels" :key="label" class="metric">
          <span>{{ label }}</span>
          <strong>{{ metrics[index] }}</strong>
        </article>
      </section>

      <section class="workspace">
        <form class="panel" @submit.prevent="submit">
          <h2>{{ project.formTitle }}</h2>
          <div class="form-grid">
            <label v-for="field in fields" :key="field.key">
              {{ field.label }}
              <select v-if="field.type === 'select'" v-model="form[field.key]" required>
                <option value="">请选择</option>
                <option v-for="option in field.options" :key="option">{{ option }}</option>
              </select>
              <input v-else v-model="form[field.key]" :type="field.type || 'text'" required />
            </label>
            <label>
              备注
              <textarea v-model="note" placeholder="填写处理说明或现场备注" />
            </label>
            <button type="submit">{{ project.primaryAction }}</button>
          </div>
        </form>

        <section class="list-panel">
          <div class="toolbar">
            <h2>{{ project.entityLabel }}列表</h2>
            <select v-model="filter">
              <option v-for="item in project.filters" :key="item">{{ item }}</option>
            </select>
          </div>

          <div class="record-grid">
            <div v-if="filteredRecords.length === 0" class="empty">暂无匹配数据</div>
            <article v-for="record in filteredRecords" :key="record.id" class="record">
              <div class="record-head">
                <p class="record-title">{{ primaryText(record) }}</p>
                <span class="status">{{ record.status }}</span>
              </div>
              <div class="details">
                <span v-for="field in fields" :key="field.key">{{ field.label }}: {{ record[field.key] }}</span>
              </div>
              <p class="note">{{ record.notes }}</p>
              <div class="actions">
                <button type="button" @click="flow(record)">流转状态</button>
                <button class="secondary" type="button" @click="navigator.clipboard?.writeText(primaryText(record))">复制摘要</button>
                <button class="danger" type="button" @click="remove(record.id)">删除</button>
              </div>
            </article>
          </div>

          <div class="mini-chart">
            <div v-for="row in chartRows" :key="row.status" class="bar">
              <span>{{ row.status }}</span>
              <div class="bar-track"><div class="bar-fill" :style="{ width: `${(row.value / maxChart) * 100}%` }" /></div>
              <strong>{{ row.value }}</strong>
            </div>
          </div>
        </section>
      </section>

      <section class="supply">
        <div class="supply-head">
          <div>
            <p class="eyebrow">应急补给</p>
            <h2 class="supply-title">应急补给批次闭环</h2>
          </div>
          <p class="supply-hint">
            安全线 {{ SAFETY_STOCK_LINE.toLocaleString() }}L：仅营业中且库存不高于安全线的站点可纳入；
            同一区域已有未结束批次、或任一站点库存高于安全线时整批拒绝；发车后按到站顺序逐站签收，签收前进入库存紧张立即冻结。
          </p>
        </div>

        <div class="supply-grid">
          <form class="panel supply-form" @submit.prevent="createBatch">
            <h2>登记补给批次</h2>
            <div class="form-grid">
              <label>
                补给区域
                <select v-model="batchArea" @change="onBatchAreaChange">
                  <option value="">请选择区域</option>
                  <option v-for="areaItem in areas" :key="areaItem" :value="areaItem">
                    {{ areaItem }}{{ areaBusy(areaItem) ? "（名额占用中）" : "" }}
                  </option>
                </select>
              </label>
              <label>
                油品
                <select v-model="batchFuel">
                  <option v-for="fuel in fuelTypes" :key="fuel" :value="fuel">{{ fuel }}</option>
                </select>
              </label>
              <label>
                总额度（L）
                <input v-model.number="batchQuota" type="number" min="0" step="100" placeholder="本批次累计补给量上限" />
              </label>

              <div class="quota-line" :class="{ over: remainingQuota < 0 }">
                <span>累计补给量：<strong>{{ plannedTotal.toLocaleString() }}L</strong></span>
                <span>剩余额度：<strong>{{ remainingQuota.toLocaleString() }}L</strong></span>
              </div>

              <div>
                <p class="block-title">选择营业中站点（按区域列出）</p>
                <div v-if="!batchArea" class="empty">请先选择补给区域</div>
                <div v-else-if="areaStations.length === 0" class="empty">该区域暂无站点</div>
                <div v-else class="station-pick">
                  <button
                    v-for="stationItem in areaStations"
                    :key="stationItem.id"
                    type="button"
                    class="pick-row"
                    :class="{
                      selected: isStationSelected(stationItem.id),
                      disabled: stationItem.status !== '营业中'
                    }"
                    :disabled="stationItem.status !== '营业中'"
                    @click="toggleStation(stationItem)"
                  >
                    <span class="pick-name">
                      {{ stationItem.station }}
                      <em v-if="isStationSelected(stationItem.id)">已选</em>
                    </span>
                    <span class="pick-meta">
                      库存 {{ Number(stationItem.stock).toLocaleString() }}L · {{ stationItem.status }}
                      <b v-if="Number(stationItem.stock) > SAFETY_STOCK_LINE" class="over-line">高于安全线</b>
                    </span>
                  </button>
                </div>
              </div>

              <div v-if="selectedStops.length > 0">
                <p class="block-title">到站顺序与逐站补给量（可上下调整）</p>
                <div class="stop-editor">
                  <div v-for="(stopItem, index) in selectedStops" :key="stopItem.id" class="stop-row">
                    <span class="stop-index">{{ index + 1 }}</span>
                    <div class="stop-main">
                      <span class="stop-name">
                        {{ stationName(stopItem.id) }}
                        <small>当前库存 {{ stationStock(stopItem.id).toLocaleString() }}L</small>
                      </span>
                      <input
                        v-model.number="stopPlanned[stopItem.id]"
                        class="stop-amount"
                        type="number"
                        min="0"
                        step="100"
                        placeholder="补给量L"
                      />
                    </div>
                    <span class="stop-arrows">
                      <button type="button" class="step-btn" :disabled="index === 0" @click="moveStop(index, -1)">上移</button>
                      <button type="button" class="step-btn" :disabled="index === selectedStops.length - 1" @click="moveStop(index, 1)">下移</button>
                    </span>
                  </div>
                </div>
              </div>

              <div v-if="batchError" class="msg-error">{{ batchError }}</div>
              <button type="submit">登记批次</button>
            </div>
          </form>

          <section class="list-panel">
            <div class="toolbar">
              <h2>补给批次</h2>
              <span class="slots">
                <span v-for="areaItem in areas" :key="areaItem" class="slot" :class="{ busy: areaBusy(areaItem) }">
                  {{ areaItem }}{{ areaBusy(areaItem) ? " · 名额占用" : " · 名额空闲" }}
                </span>
              </span>
            </div>

            <div v-if="actionMessage" class="msg-info">{{ actionMessage }}</div>

            <div class="record-grid">
              <div v-if="batches.length === 0" class="empty">暂无补给批次</div>

              <article v-for="batchItem in batches" :key="batchItem.id" class="batch-card">
                <div class="batch-head">
                  <p class="batch-code">
                    {{ batchItem.code }}
                    <small>{{ batchItem.area }} · {{ batchItem.fuelType }}</small>
                  </p>
                  <span class="batch-status" :class="batchStatusClass(batchItem.status)">{{ batchItem.status }}</span>
                </div>

                <div class="batch-meta">
                  <span>额度 {{ batchItem.quota.toLocaleString() }}L</span>
                  <span>已签收 {{ batchSignedTotal(batchItem).toLocaleString() }}L / 计划 {{ batchPlannedTotal(batchItem).toLocaleString() }}L</span>
                  <span>发车：{{ formatTime(batchItem.dispatchedAt) }}</span>
                </div>
                <div class="bar-track batch-track">
                  <div class="bar-fill" :style="{ width: `${batchPercent(batchItem)}%` }" />
                </div>

                <ol class="stop-list">
                  <li v-for="(stopItem, index) in batchItem.stops" :key="stopItem.stationId" class="stop-item">
                    <span class="stop-badge" :class="stopState(batchItem, index)">
                      {{ stopState(batchItem, index) === "done" ? "✓" : index + 1 }}
                    </span>
                    <div class="stop-info">
                      <p class="stop-line">
                        <strong>{{ stationName(stopItem.stationId) }}</strong>
                        （库存 {{ stationStock(stopItem.stationId).toLocaleString() }}L，补给 {{ stopItem.planned.toLocaleString() }}L）
                        <span class="stop-chip" :class="stopState(batchItem, index)">
                          {{ stopStateLabel(stopState(batchItem, index)) }}
                        </span>
                      </p>
                      <p v-if="stopItem.signed" class="stop-time">签收时间：{{ formatTime(stopItem.signedAt) }}</p>
                      <button
                        v-if="stopState(batchItem, index) === 'current'"
                        type="button"
                        @click="signStop(batchItem, index)"
                      >
                        本站签收
                      </button>
                    </div>
                  </li>
                </ol>

                <div v-if="batchItem.status === '已冻结'" class="freeze-box">
                  已冻结：{{ batchItem.freezeReason }}
                </div>

                <div class="batch-foot">
                  <button v-if="batchItem.status === '待发车'" type="button" @click="dispatchBatch(batchItem)">发车</button>
                  <span v-if="batchItem.status === '已完成'" class="done-text">
                    全部签收完成（{{ formatTime(batchItem.completedAt) }}），区域名额已释放
                  </span>
                  <span v-else-if="batchItem.status === '已冻结'" class="done-text">此前签收已保留，后续站点不得跳过</span>
                </div>
              </article>
            </div>
          </section>
        </div>
      </section>
    </div>
  </main>
</template>
