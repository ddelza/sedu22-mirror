// 지금까지 태깅된 게시글들에서 "어떤 단원끼리 같은 글에 함께 태그되는지"를 집계해서
// curriculum/unit-correlations.json으로 저장한다.
//
// 계수는 co-occurrence 원시 횟수가 아니라 overlap coefficient로 정규화한다:
//   coefficient(A,B) = cooccur(A,B) / min(count(A), count(B))
// 자주 등장하는 단원(예: 태양계)이 실제로는 안 겹치는 다른 단원들과도 원시 횟수만으로
// 상위권을 차지하는 걸 막기 위함 — 값이 클수록(최대 1.0) 두 단원이 강하게 같이 태그된다는 뜻.
//
// 1단계(SKILL.md 참고)에서는 이 테이블을 판단에 참조하지 않고 그냥 갱신만 해서
// 표본을 쌓아둔다. 2단계부터 태깅 시 참조한다.
//
// 사용법: node build-unit-correlations.js
const fs = require('fs');
const path = require('path');

const REPO = path.join(__dirname, '..', '..', '..', '..');
const POSTS_DIR = path.join(REPO, 'data', 'posts');
const OUT_PATH = path.join(REPO, 'curriculum', 'unit-correlations.json');
const TOP_K = 5;
const MIN_COOCCUR = 1;

function unitKey(t) {
  if (!t.unit || t.unit === '미분류') return null;
  return `${t.curriculumYear}|${t.schoolLevel}|${t.unit}`;
}

const unitCount = {};
const cooccurCount = {}; // "keyA<->keyB" (sorted) -> count
let totalTaggedPosts = 0;

for (const fldid of fs.readdirSync(POSTS_DIR)) {
  const boardDir = path.join(POSTS_DIR, fldid);
  if (!fs.statSync(boardDir).isDirectory()) continue;
  for (const f of fs.readdirSync(boardDir)) {
    if (!f.endsWith('.json')) continue;
    const post = JSON.parse(fs.readFileSync(path.join(boardDir, f), 'utf8'));
    if (!post.tags) continue;
    totalTaggedPosts++;
    const keys = [...new Set(post.tags.map(unitKey).filter(Boolean))];
    for (const k of keys) unitCount[k] = (unitCount[k] || 0) + 1;
    for (let i = 0; i < keys.length; i++) {
      for (let j = i + 1; j < keys.length; j++) {
        const pairKey = [keys[i], keys[j]].sort().join('<->');
        cooccurCount[pairKey] = (cooccurCount[pairKey] || 0) + 1;
      }
    }
  }
}

const neighbors = {}; // unitKey -> [{unit, cooccur, coefficient}]
for (const pairKey of Object.keys(cooccurCount)) {
  const [a, b] = pairKey.split('<->');
  const cooccur = cooccurCount[pairKey];
  if (cooccur < MIN_COOCCUR) continue;
  const coefficient = cooccur / Math.min(unitCount[a], unitCount[b]);
  (neighbors[a] = neighbors[a] || []).push({ unit: b, cooccur, coefficient });
  (neighbors[b] = neighbors[b] || []).push({ unit: a, cooccur, coefficient });
}
for (const k of Object.keys(neighbors)) {
  neighbors[k].sort((x, y) => y.coefficient - x.coefficient || y.cooccur - x.cooccur);
  neighbors[k] = neighbors[k].slice(0, TOP_K);
}

const output = {
  generatedAt: new Date().toISOString(),
  totalTaggedPosts,
  unitCount,
  neighbors,
};

fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
fs.writeFileSync(OUT_PATH, JSON.stringify(output, null, 2));

console.log(`단원 ${Object.keys(unitCount).length}개, 연관쌍 ${Object.keys(cooccurCount).length}개 집계 완료 (태깅된 글 ${totalTaggedPosts}건 기준)`);
console.log(`-> ${OUT_PATH}`);
