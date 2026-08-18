// next-unclassified-review-batch.js로 뽑은 배치를 검토한 결과(scratch/unclassified-review-result.json)를
// 적용한다. tags가 있는 항목은 기존 "미분류" 판정을 새 태그로 교체하고("게시판별 분류" 태그는 보존),
// tags가 없거나 빈 배열인 항목은 "미분류" 유지로 보고 검토완료 상태로만 표시한다.
// (재분류할 게 없는 글도 반드시 결과 배열에 포함시켜야 함 — 그래야 다음 배치에서 건너뛴다.)
//
// 입력 형식: [{ "id": "fldid-dataid", "tags": [...태그객체...] | null, "tagsNote": "..." }, ...]
// 사용법: node apply-unclassified-review.js [입력경로]
const fs = require('fs');
const path = require('path');

const REPO = path.join(__dirname, '..', '..', '..', '..');
const POSTS_DIR = path.join(REPO, 'data', 'posts');
const STATE_PATH = path.join(__dirname, '..', 'scratch', 'unclassified-review-state.json');
const IN_PATH = process.argv[2] || path.join(__dirname, '..', 'scratch', 'unclassified-review-result.json');

const results = JSON.parse(fs.readFileSync(IN_PATH, 'utf8'));

let state = { reviewed: [] };
if (fs.existsSync(STATE_PATH)) state = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
const reviewedSet = new Set(state.reviewed);

let reclassified = 0;
let keptUnclassified = 0;
let missing = 0;

for (const item of results) {
  const [fldid, dataid] = item.id.split('-');
  const filePath = path.join(POSTS_DIR, fldid, `${dataid}.json`);
  if (!fs.existsSync(filePath)) {
    console.error(`파일 없음: ${filePath} (id=${item.id})`);
    missing++;
    continue;
  }
  if (item.tags && item.tags.length > 0) {
    const post = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const boardTags = (post.tags || []).filter(t => t.category === '게시판별 분류');
    post.tags = [...boardTags, ...item.tags];
    post.tagsNote = item.tagsNote || post.tagsNote || '';
    post.taggedAt = new Date().toISOString();
    fs.writeFileSync(filePath, JSON.stringify(post, null, 2));
    reclassified++;
  } else {
    keptUnclassified++;
  }
  reviewedSet.add(item.id);
}

state.reviewed = [...reviewedSet];
fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 1));

console.log(`재분류: ${reclassified}건, 미분류 유지(검토완료 처리): ${keptUnclassified}건, 파일 없음: ${missing}건`);
console.log(`누적 검토 완료: ${state.reviewed.length}건`);
