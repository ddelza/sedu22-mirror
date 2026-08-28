// next-topic-retro-review-batch.js로 뽑은 배치를 검토한 결과
// (scratch/topic-retro-review-result.json)를 적용한다.
// 기존 태그는 절대 건드리지 않고, 새로 발견한 태그만 뒤에 이어붙인다(add-tags.js와 동일한 append 방식).
// tags가 없거나 빈 배열이면 "추가할 게 없다"는 뜻으로 보고 검토완료 상태로만 표시한다.
//
// 입력 형식: [{ "id": "fldid-dataid", "tags": [...추가할 태그만...] | null }, ...]
// 사용법: node apply-topic-retro-review.js [입력경로]
const fs = require('fs');
const path = require('path');

const REPO = path.join(__dirname, '..', '..', '..', '..');
const POSTS_DIR = path.join(REPO, 'data', 'posts');
const STATE_PATH = path.join(__dirname, '..', 'scratch', 'topic-retro-review-state.json');
const IN_PATH = process.argv[2] || path.join(__dirname, '..', 'scratch', 'topic-retro-review-result.json');

const results = JSON.parse(fs.readFileSync(IN_PATH, 'utf8'));

let state = { reviewed: [] };
if (fs.existsSync(STATE_PATH)) state = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
const reviewedSet = new Set(state.reviewed);

let added = 0;
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
  if (item.tags && item.tags.length > 0) {
    const post = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (!post.tags) post.tags = [];
    const existingKeys = new Set(post.tags.map(t => JSON.stringify(t)));
    let addedHere = 0;
    for (const tag of item.tags) {
      const key = JSON.stringify(tag);
      if (existingKeys.has(key)) continue;
      post.tags.push(tag);
      existingKeys.add(key);
      addedHere++;
    }
    if (addedHere > 0) {
      if (item.tagsNote) {
        post.tagsNote = post.tagsNote ? `${post.tagsNote} / ${item.tagsNote}` : item.tagsNote;
      }
      post.taggedAt = new Date().toISOString();
      fs.writeFileSync(filePath, JSON.stringify(post, null, 2));
      added++;
    } else {
      noChange++;
    }
  } else {
    noChange++;
  }
  reviewedSet.add(item.id);
}

state.reviewed = [...reviewedSet];
fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 1));

console.log(`태그 추가: ${added}건, 변경없음(검토완료 처리): ${noChange}건, 파일 없음: ${missing}건`);
console.log(`누적 검토 완료: ${state.reviewed.length}건`);
