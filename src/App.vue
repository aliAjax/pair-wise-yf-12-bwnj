<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import {
  FUEL_TYPES,
  SAFETY_LINE,
  buildBatch,
  dispatchBatch,
  isOpenBatch,
  signNextStop,
  validateDraft,
  type StationLike,
  type SupplyBatch
} from "./supply";

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
  "batchStorageKey": "hxwlfront-21-supply-batches",
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
      "stock": 8200,
      "manager": "刘站长",
      "status": "营业中",
      "notes": "92#汽油偏低"
    },
    {
      "station": "东区二站",
      "area": "东区",
      "stock": 6400,
      "manager": "陈站长",
      "status": "营业中",
      "notes": "柴油待补"
    },
    {
      "station": "东区三站",
      "area": "东区",
      "stock": 36000,
      "manager": "赵站长",
      "status": "营业中",
      "notes": "库存充足"
    },
    {
      "station": "西区一站",
      "area": "西区",
      "stock": 9800,
      "manager": "孙站长",
      "status": "营业中",
      "notes": "库存偏低"
    },
    {
      "station": "西区二站",
      "area": "西区",
      "stock": 5300,
      "manager": "周站长",
      "status": "营业中",
      "notes": "95#汽油告急"
    },
    {
      "station": "机场快线站",
      "area": "机场线",
      "stock": 9000,
      "manager": "王站长",
      "status": "库存紧张",
      "notes": "柴油待补"
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

const records = ref<RecordItem[]>(loadRecords());
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

function flow(record: RecordItem) {
  record.status = nextStatus(record.status);
  persist();
}

function remove(id: string) {
  records.value = records.value.filter((record) => record.id !== id);
  persist();
}

// ============ 应急补给批次闭环 ============

function loadBatches(): SupplyBatch[] {
  const raw = localStorage.getItem(project.batchStorageKey);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as SupplyBatch[];
  } catch {
    return [];
  }
}

const batches = ref<SupplyBatch[]>(loadBatches());

const fuelTypes = [...FUEL_TYPES];

const batchFuelType = ref<string>(FUEL_TYPES[0]);
const batchQuota = ref<number>(30000);
const selectedStationIds = ref<string[]>([]);
const supplyAmounts = reactive<Record<string, number>>({});
const batchErrors = ref<string[]>([]);
const batchMessage = ref("");

const stations = computed<StationLike[]>(() =>
  records.value.map((record) => ({
    id: record.id,
    station: String(record.station ?? ""),
    area: String(record.area ?? ""),
    stock: Number(record.stock ?? 0),
    status: String(record.status ?? "")
  }))
);

function stationById(id: string): StationLike | undefined {
  return stations.value.find((station) => station.id === id);
}

/** 到站顺序：按勾选顺序。 */
const selectedStations = computed<StationLike[]>(() =>
  selectedStationIds.value
    .map((id) => stationById(id))
    .filter((station): station is StationLike => Boolean(station))
);

const batchArea = computed(() => selectedStations.value[0]?.area ?? "");

const openAreas = computed(
  () =>
    new Set(
      batches.value
        .filter((batch) => isOpenBatch(batch))
        .map((batch) => batch.area)
    )
);

/** 勾选列表中展示的营业中站点（不营业/库存紧张的站点不能被选中）。 */
const selectableStations = computed(() =>
  stations.value.filter((station) => station.status === "营业中")
);

function isStationSelectable(station: StationLike): boolean {
  if (station.status !== "营业中") return false;
  // 已选第一站后，其他区域禁用
  if (batchArea.value && station.area !== batchArea.value) return false;
  return true;
}

function isStationSelected(station: StationLike): boolean {
  return selectedStationIds.value.includes(station.id);
}

function toggleStation(station: StationLike) {
  if (!isStationSelected(station)) {
    if (!isStationSelectable(station)) return;
    selectedStationIds.value = [...selectedStationIds.value, station.id];
    if (!supplyAmounts[station.id]) supplyAmounts[station.id] = 0;
  } else {
    selectedStationIds.value = selectedStationIds.value.filter((id) => id !== station.id);
  }
}

function moveStop(stationId: string, delta: -1 | 1) {
  const list = [...selectedStationIds.value];
  const index = list.indexOf(stationId);
  const target = index + delta;
  if (index < 0 || target < 0 || target >= list.length) return;
  [list[index], list[target]] = [list[target], list[index]];
  selectedStationIds.value = list;
}

const supplyTotal = computed(() =>
  selectedStations.value.reduce((sum, station) => sum + Number(supplyAmounts[station.id] || 0), 0)
);

const overQuota = computed(() => supplyTotal.value > batchQuota.value);

function persistBatches() {
  localStorage.setItem(project.batchStorageKey, JSON.stringify(batches.value));
}

/** 登记批次：任一规则不满足则整批拒绝，页面与本地数据不变。 */
function registerBatch() {
  batchErrors.value = [];
  batchMessage.value = "";

  const check = validateDraft(
    {
      stations: selectedStations.value,
      amounts: supplyAmounts,
      area: batchArea.value,
      fuelType: batchFuelType.value,
      quota: Number(batchQuota.value)
    },
    batches.value
  );

  if (!check.ok) {
    // 整批拒绝：不创建批次、不改站点、不写 localStorage，仅提示
    batchErrors.value = check.errors;
    return;
  }

  const batch = buildBatch({
    stations: selectedStations.value,
    amounts: supplyAmounts,
    area: batchArea.value,
    fuelType: batchFuelType.value,
    quota: Number(batchQuota.value)
  }, check);

  batches.value = [batch, ...batches.value];
  persistBatches();

  for (const station of selectedStations.value) {
    delete supplyAmounts[station.id];
  }
  selectedStationIds.value = [];
  batchQuota.value = 30000;
  batchFuelType.value = FUEL_TYPES[0];
  batchMessage.value = `批次已登记（${batch.area} · ${batch.fuelType}），额度 ${batch.quota.toLocaleString()}L，待发车。`;
}

function dispatch(batchId: string) {
  batchErrors.value = [];
  const index = batches.value.findIndex((batch) => batch.id === batchId);
  if (index < 0) return;
  batches.value[index] = dispatchBatch(batches.value[index]);
  batches.value = [...batches.value];
  persistBatches();
  batchMessage.value = "车队已发车，请按到站顺序逐站签收。";
}

function signOff(batchId: string) {
  batchErrors.value = [];
  const index = batches.value.findIndex((batch) => batch.id === batchId);
  if (index < 0) return;

  const result = signNextStop(batches.value[index], (id) => stationById(id));
  batches.value[index] = result.batch;
  batches.value = [...batches.value];

  if (result.signedStop) {
    const station = stationById(result.signedStop.stationId);
    if (station) {
      const record = records.value.find((item) => item.id === station.id);
      if (record) {
        record.stock = Number(record.stock || 0) + result.delivered;
        persist();
      }
    }
  }

  persistBatches();
  if (result.frozen) {
    batchErrors.value = [result.message];
  } else {
    batchMessage.value = result.message;
  }
}

function batchProgress(batch: SupplyBatch): { signed: number; total: number } {
  const signed = batch.stops.filter((stop) => stop.signed).length;
  return { signed, total: batch.stops.length };
}
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
        <header class="supply-head">
          <div>
            <h2>应急补给批次</h2>
            <p class="supply-sub">
              勾选营业中站点登记油品与总额度；累计补给量不得超过额度。同区域已有未结束批次，或任一站点库存高于安全线
              <strong>{{ SAFETY_LINE.toLocaleString() }}L</strong> 时整批拒绝。发车后按到站顺序逐站签收；签收前进入库存紧张将冻结批次。
            </p>
          </div>
        </header>

        <div class="supply-grid">
          <!-- 登记批次 -->
          <form class="panel" @submit.prevent="registerBatch">
            <h3>登记新批次</h3>

            <div class="batch-form">
              <label>
                补给油品
                <select v-model="batchFuelType">
                  <option v-for="fuel in fuelTypes" :key="fuel" :value="fuel">{{ fuel }}</option>
                </select>
              </label>
              <label>
                总额度（L）
                <input v-model.number="batchQuota" type="number" min="1" step="100" required />
              </label>
            </div>

            <p class="area-hint">
              <template v-if="batchArea">本批次区域：<strong>{{ batchArea }}</strong></template>
              <template v-else>未选择站点（仅可勾选同一区域内营业中的站点）</template>
              <template v-if="batchArea && openAreas.has(batchArea)">
                <span class="warn"> · 该区域已有未结束批次，提交将被整批拒绝</span>
              </template>
            </p>

            <div class="station-pick">
              <label
                v-for="station in selectableStations"
                :key="station.id"
                class="pick-item"
                :class="{
                  selected: isStationSelected(station),
                  disabled: !isStationSelectable(station),
                  unsafe: station.stock > SAFETY_LINE
                }"
              >
                <input
                  type="checkbox"
                  class="pick-box"
                  :checked="isStationSelected(station)"
                  :disabled="!isStationSelectable(station)"
                  @change="toggleStation(station)"
                />
                <span class="pick-name">{{ station.station }}</span>
                <span class="pick-meta">
                  {{ station.area }} ·
                  <span :class="{ overline: station.stock > SAFETY_LINE }">
                    库存 {{ station.stock.toLocaleString() }}L
                  </span>
                </span>
              </label>
            </div>

            <div v-if="selectedStations.length" class="stops-edit">
              <p class="stops-title">到站顺序与逐站补给量</p>
              <div v-for="(station, index) in selectedStations" :key="station.id" class="stop-row">
                <span class="stop-no">{{ index + 1 }}</span>
                <span class="stop-name">{{ station.station }}</span>
                <input
                  v-model.number="supplyAmounts[station.id]"
                  type="number"
                  min="0"
                  step="100"
                  class="stop-amount"
                />
                <span class="stop-unit">L</span>
                <span class="stop-order">
                  <button type="button" class="mini" :disabled="index === 0" @click="moveStop(station.id, -1)">↑</button>
                  <button
                    type="button"
                    class="mini"
                    :disabled="index === selectedStations.length - 1"
                    @click="moveStop(station.id, 1)"
                  >
                    ↓
                  </button>
                </span>
              </div>
            </div>

            <p class="quota-line" :class="{ over: overQuota }">
              累计补给量：<strong>{{ supplyTotal.toLocaleString() }}L</strong> / 额度
              {{ Number(batchQuota || 0).toLocaleString() }}L
              <span v-if="overQuota" class="warn">（超额，提交将被整批拒绝）</span>
            </p>

            <ul v-if="batchErrors.length" class="batch-errors">
              <li v-for="error in batchErrors" :key="error">{{ error }}</li>
            </ul>
            <p v-if="batchMessage" class="batch-ok">{{ batchMessage }}</p>

            <button type="submit" class="full-btn">登记批次</button>
          </form>

          <!-- 批次列表 -->
          <section class="list-panel batch-list">
            <div class="toolbar">
              <h2>补给批次列表</h2>
              <span class="slot-tip">占用区域名额：{{ openAreas.size }} 个</span>
            </div>

            <div class="record-grid">
              <div v-if="batches.length === 0" class="empty">暂无应急补给批次</div>

              <article
                v-for="batch in batches"
                :key="batch.id"
                class="record batch-card"
                :class="{ frozen: batch.status === '已冻结', done: batch.status === '已完成' }"
              >
                <div class="record-head">
                  <p class="record-title">{{ batch.area }} · {{ batch.fuelType }}</p>
                  <span class="status" :class="`st-${batch.status}`">{{ batch.status }}</span>
                </div>

                <div class="details">
                  <span>总额度：{{ batch.quota.toLocaleString() }}L</span>
                  <span>
                    签收进度：{{ batchProgress(batch).signed }}/{{ batchProgress(batch).total }} 站
                  </span>
                  <span>登记时间：{{ new Date(batch.createdAt).toLocaleString() }}</span>
                  <span v-if="batch.dispatchedAt">发车时间：{{ new Date(batch.dispatchedAt).toLocaleString() }}</span>
                </div>

                <ol class="stop-list">
                  <li v-for="(stop, index) in batch.stops" :key="stop.stationId" class="stop-track">
                    <span class="stop-idx">{{ index + 1 }}</span>
                    <span class="stop-dot" :class="{ signed: stop.signed }" />
                    <span class="stop-label">{{ stop.station }}</span>
                    <span class="stop-vol">{{ stop.amount.toLocaleString() }}L</span>
                    <span v-if="stop.signed" class="signed-tag">已签收 {{ new Date(stop.signedAt!).toLocaleString() }}</span>
                    <span v-else-if="batch.status === '已冻结'" class="pending-tag frozen-tag">冻结·未签收</span>
                    <span v-else class="pending-tag">待签收</span>
                  </li>
                </ol>

                <p v-if="batch.freezeReason" class="note freeze-note">{{ batch.freezeReason }}</p>

                <div class="actions">
                  <button v-if="batch.status === '待发车'" type="button" @click="dispatch(batch.id)">发车</button>
                  <button v-if="batch.status === '运输中'" type="button" @click="signOff(batch.id)">
                    签收下一站（{{ batch.stops.find((s) => !s.signed)?.station }}）
                  </button>
                  <span v-if="batch.status === '已完成'" class="done-tip">区域名额已释放</span>
                  <span v-if="batch.status === '已冻结'" class="done-tip warn">批次已冻结，后续站点不得跳过</span>
                </div>
              </article>
            </div>
          </section>
        </div>
      </section>
    </div>
  </main>
</template>
