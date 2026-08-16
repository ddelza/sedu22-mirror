// next-hs-review-batch.js로 뽑은 배치를 검토한 결과(scratch/hs-review-result.json)를
// 적용한다. 기존 태그는 절대 건드리지 않고, addTags에 있는 태그만 이어붙인다.
// apply-ms-review.js의 고등학교 버전 — state 파일 경로만 다르다.
//
// 입력 형식: [{ "id": "fldid-dataid", "addTags": [...태그객체...], "note": "보완 근거 한줄" }, ...]
// 사용법: node apply-hs-review.js [입력경로]
const fs = require('fs');
const path = require('path');

const REPO = path.join(__dirname, '..', '..', '..', '..');
const POSTS_DIR = path.join(REPO, 'data', 'posts');
const STATE_PATH = path.join(__dirname, '..', 'scratch', 'hs-review-state.json');
const IN_PATH = process.argv[2] || path.join(__dirname, '..', 'scratch', 'hs-review-result.json');

const results = JSON.parse(fs.readFileSync(IN_PATH, 'utf8'));

let state = { reviewed: [] };
if (fs.existsSync(STATE_PATH)) state = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
const reviewedSet = new Set(state.reviewed);

let augmented = 0;
let noChange = 0;
let missing = 0;

for (const item of results) {
  const [fldid, dataid] = item.id.split('-');
  const filePath = path.join(POSTS_DIR, fldid, `${dataid}.json`);
  if (!fs.existsSync(filePath)) {
    console.error(`파일 없음: ${filePath} (id=${item.id})`);
    missing++;
    continue;
  }
  if (item.addTags && item.addTags.length > 0) {
    const post = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    post.tags = [...post.tags, ...item.addTags];
    const noteAddition = item.note ? ` [보완: ${item.note}]` : '';
    post.tagsNote = (post.tagsNote || '') + noteAddition;
    post.verticalReviewedAt = new Date().toISOString();
    fs.writeFileSync(filePath, JSON.stringify(post, null, 2));
    augmented++;
  } else {
    noChange++;
  }
  reviewedSet.add(item.id);
}

state.reviewed = [...reviewedSet];
fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 1));

console.log(`태그 보완: ${augmented}건, 변경 없음(검토완료 처리): ${noChange}건, 파일 없음: ${missing}건`);
console.log(`누적 검토 완료: ${state.reviewed.length}건`);
