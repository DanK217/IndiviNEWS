/*
 * score.js — src/cluster.js のクラスタリング品質をgolden set（fixtures/clusters.json）
 * に対するペアワイズ精度で採点する（実装非依存）。
 *
 * 実行: node experiment/score.js [--verbose]
 *
 * 指標: 全アイテムペア(i<j)について「同一クラスタと予測したか」×「正解が同一クラスタか」
 * から precision / recall / F1 を算出する。誤判定ペアは常に表示する。
 */
const path = require("path");

const fixture = require("./fixtures/clusters.json");
const verbose = process.argv.includes("--verbose");

function fail(message) {
  console.error(`構造エラー: ${message}`);
  console.error("（全アイテムをちょうど1回ずつ、渡したオブジェクトのまま返す必要があります）");
  process.exit(2);
}

let clusterItems;
try {
  ({ clusterItems } = require(path.join(__dirname, "..", "src", "cluster")));
} catch (err) {
  console.error(`src/cluster.js を読み込めません: ${err.message}`);
  process.exit(1);
}
if (typeof clusterItems !== "function") {
  console.error("src/cluster.js が clusterItems 関数をエクスポートしていません");
  process.exit(1);
}

// expectedCluster を隠した入力を作る（URLは全fixtureで一意なので照合キーに使える）
const inputs = fixture.items.map(({ expectedCluster, ...rest }) => ({ ...rest }));
const validUrls = new Set(inputs.map((i) => i.url));

let predicted;
try {
  predicted = clusterItems(inputs);
} catch (err) {
  console.error(`clusterItems が例外を投げました: ${err.stack || err}`);
  process.exit(1);
}
if (!Array.isArray(predicted) || !predicted.every(Array.isArray)) {
  fail("戻り値が「配列の配列」ではありません");
}

// 構造検証: 全アイテムがちょうど1回ずつ現れること
const predLabelByUrl = new Map();
for (let ci = 0; ci < predicted.length; ci++) {
  for (const item of predicted[ci]) {
    const url = item && item.url;
    if (!validUrls.has(url)) fail(`入力に存在しないアイテムが返されました: ${url}`);
    if (predLabelByUrl.has(url)) fail(`アイテムが複数クラスタに出現しています: ${url}`);
    predLabelByUrl.set(url, ci);
  }
}
if (predLabelByUrl.size !== inputs.length) {
  fail(`返却アイテム数が不足しています（${predLabelByUrl.size}/${inputs.length}）`);
}

// ペアワイズ採点
let tp = 0;
let fp = 0;
let fn = 0;
let tn = 0;
const falsePositives = [];
const falseNegatives = [];

const items = fixture.items;
for (let i = 0; i < items.length; i++) {
  for (let j = i + 1; j < items.length; j++) {
    const expectedSame = items[i].expectedCluster === items[j].expectedCluster;
    const predictedSame =
      predLabelByUrl.get(items[i].url) === predLabelByUrl.get(items[j].url);
    if (expectedSame && predictedSame) tp++;
    else if (!expectedSame && predictedSame) {
      fp++;
      falsePositives.push([items[i].title, items[j].title]);
    } else if (expectedSame && !predictedSame) {
      fn++;
      falseNegatives.push([items[i].title, items[j].title]);
    } else tn++;
  }
}

const precision = tp + fp === 0 ? 0 : tp / (tp + fp);
const recall = tp + fn === 0 ? 0 : tp / (tp + fn);
const f1 =
  precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);

console.log(`ペア総数   : ${tp + fp + fn + tn}`);
console.log(`TP=${tp}  FP=${fp}  FN=${fn}  TN=${tn}`);
console.log(`precision : ${precision.toFixed(3)}`);
console.log(`recall    : ${recall.toFixed(3)}`);
console.log(`F1        : ${f1.toFixed(3)}`);

if (falsePositives.length > 0) {
  console.log("\n誤ってまとめたペア (FP):");
  for (const [a, b] of falsePositives) console.log(`  ✗ 「${a}」×「${b}」`);
}
if (falseNegatives.length > 0) {
  console.log("\nまとめ損ねたペア (FN):");
  for (const [a, b] of falseNegatives) console.log(`  ✗ 「${a}」×「${b}」`);
}
if (verbose) {
  console.log("\n予測クラスタ:");
  predicted.forEach((cluster, ci) => {
    if (cluster.length > 1) {
      console.log(`  [${ci}] ${cluster.map((x) => x.title).join(" / ")}`);
    }
  });
}
