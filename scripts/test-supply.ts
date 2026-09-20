import {
  SAFETY_LINE,
  buildBatch,
  dispatchBatch,
  isOpenBatch,
  signNextStop,
  validateDraft,
  type Draft,
  type StationLike,
  type SupplyBatch
} from "../src/supply.ts";

let failures = 0;
function assert(cond: boolean, message: string) {
  if (!cond) {
    failures++;
    console.error("FAIL:", message);
  } else {
    console.log("PASS:", message);
  }
}

const stations: StationLike[] = [
  { id: "e1", station: "东区一站", area: "东区", stock: 8000, status: "营业中" },
  { id: "e2", station: "东区二站", area: "东区", stock: 6000, status: "营业中" },
  { id: "e3", station: "东区三站", area: "东区", stock: 40000, status: "营业中" },
  { id: "w1", station: "西区一站", area: "西区", stock: 9000, status: "营业中" },
  { id: "j1", station: "机场快线站", area: "机场线", stock: 9000, status: "库存紧张" }
];

function makeDraft(ids: string[], quota = 30000, amounts?: Record<string, number>): Draft {
  const picked = stations.filter((s) => ids.includes(s.id));
  const amt = Object.fromEntries(picked.map((s) => [s.id, amounts?.[s.id] ?? 5000]));
  return {
    stations: picked,
    amounts: amt,
    area: picked[0]?.area ?? "",
    fuelType: "0#柴油",
    quota
  };
}

// 1. 正常建批通过
const good = validateDraft(makeDraft(["e1", "e2"]), []);
assert(good.ok, "正常批次校验通过");

// 2. 库存高于安全线整批拒绝
const unsafe = validateDraft(makeDraft(["e1", "e3"]), []);
assert(!unsafe.ok && unsafe.errors.some((e) => e.includes("安全线")), "含高库存站点整批拒绝");

// 3. 累计补给量超过额度拒绝
const over = validateDraft(makeDraft(["e1", "e2"], 9000), []);
assert(!over.ok && over.errors.some((e) => e.includes("超过总额度")), "累计补给量超额拒绝");

// 4. 只能选营业中
const notOpen = validateDraft(makeDraft(["j1"]), []);
assert(!notOpen.ok, "库存紧张站点不可进入批次");

// 5. 同区域未结束批次占用名额
let batch = buildBatch(makeDraft(["e1", "e2"]), good);
const occupied: SupplyBatch[] = [batch];
const dup = validateDraft(makeDraft(["e2"]), occupied);
assert(!dup.ok && dup.errors.some((e) => e.includes("名额")), "同区域未结束批次拒绝新批");

// 6. 不同区域不冲突
const west = validateDraft(makeDraft(["w1"]), occupied);
assert(west.ok, "不同区域可建批次");

// 7. 发车后逐站签收
batch = dispatchBatch(batch);
assert(batch.status === "运输中", "发车进入运输中");

// 第一站签收
let res = signNextStop(batch, (id) => stations.find((s) => s.id === id));
assert(!res.frozen && res.delivered === 5000 && res.batch.stops[0].signed, "第一站签收成功");
assert(isOpenBatch(res.batch), "未全部签收仍占用名额");
batch = res.batch;

// 第二站签收前进入库存紧张 -> 冻结
const tenseLookup = (id: string) => {
  const s = stations.find((x) => x.id === id);
  if (!s) return undefined;
  return id === "e2" ? { ...s, status: "库存紧张" } : s;
};
res = signNextStop(batch, tenseLookup);
assert(res.frozen && res.batch.status === "已冻结", "下一站库存紧张立即冻结");
assert(res.batch.stops[0].signed && !res.batch.stops[1].signed, "冻结保留此前签收、后续不签收");
assert(Boolean(res.batch.freezeReason), "冻结原因已记录");
batch = res.batch;

// 冻结后不能再签收
const after = signNextStop(batch, (id) => stations.find((s) => s.id === id));
assert(after.signedStop === null && after.batch.status === "已冻结", "冻结后后续站点无法跳过签收");
assert(isOpenBatch(batch), "冻结批次仍占用区域名额");

// 8. 全部签收完成释放名额
let b2 = buildBatch(
  makeDraft(["w1"]),
  validateDraft(makeDraft(["w1"]), [])
);
b2 = dispatchBatch(b2);
const fin = signNextStop(b2, (id) => stations.find((s) => s.id === id));
assert(fin.batch.status === "已完成", "全部签收后批次完成");
assert(!isOpenBatch(fin.batch), "完成后释放区域名额");
const eastAgain = validateDraft(makeDraft(["e1"]), [fin.batch]);
assert(eastAgain.ok, "已完成批次不阻塞同区域新建");

// 9. 安全线常量存在且为正数
assert(SAFETY_LINE > 0, "安全线为正数");

console.log(failures === 0 ? "\n全部通过 ✔" : `\n${failures} 个断言失败`);
if (failures > 0) process.exit(1);
