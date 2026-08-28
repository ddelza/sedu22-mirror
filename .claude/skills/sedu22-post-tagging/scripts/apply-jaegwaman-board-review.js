// next-jaegwaman-board-batch.js와 짝을 이루는 적용 스크립트.
// scratch/jaegwaman-board-review-result.json ([{id, tags: [...추가할 태그만...] | null}, ...])을 읽어서
// tags가 있으면 기존 tags 배열 뒤에 이어붙이고(add-tags.js와 동일한 방식, 중복 스킵),
// 배치에 포함됐던 모든 id는 tags 유무와 상관없이 검토 완료로 표시한다.
//
// 사용법: node apply-jaegwaman-board-review.js
const fs = require('fs');
const path = require('path');

const REPO = path.join(__dirname, '..', '..', '..', '..');
const POSTS_DIR = path.join(REPO, 'data', 'posts');
const RESULT_PATH = path.join(__dirname, '..', 'scratch', 'jaegwaman-board-review-result.json');
const STATE_PATH = path.join(__dirname, '..', 'scratch', 'jaegwaman-board-review-state.json');

const results = JSON.parse(fs.readFileSync(RESULT_PATH, 'utf8'));

let state = { reviewed: [] };
if (fs.existsSync(STATE_PATH)) state = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
const reviewedSet = new Set(state.reviewed);

let added = 0;
let skippedDup = 0;
let missing = 0;
let noTag = 0;

for (const item of results) {
  const [fldid, dataid] = item.id.split('-');
  const filePath = path.join(POSTS_DIR, fldid, `${dataid}.json`);
  if (!fs.existsSync(filePath)) {
    console.error(`파일 없음: ${filePath} (id=${item.id})`);
    missing++;
    reviewedSet.add(item.id);
    continue;
  }
  if (item.tags && item.tags.length) {
    const post = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (!post.tags) post.tags = [];
    // 실제 태그를 추가하는 경우, 의미없는 "미분류" 플레이스홀더 태그는 제거한다.
    post.tags = post.tags.filter(t => t.unit !== '미분류');
    const existingKeys = new Set(post.tags.map(t => JSON.stringify(t)));
    for (const tag of item.tags) {
      const key = JSON.stringify(tag);
      if (existingKeys.has(key)) {
        skippedDup++;
        continue;
      }
      post.tags.push(tag);
      existingKeys.add(key);
      added++;
    }
    if (item.tagsNote) post.tagsNote = post.tagsNote ? `${post.tagsNote} / ${item.tagsNote}` : item.tagsNote;
    fs.writeFileSync(filePath, JSON.stringify(post, null, 2));
  } else {
    noTag++;
  }
  reviewedSet.add(item.id);
}

state.reviewed = Array.from(reviewedSet);
fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));

console.log(`태그 추가: ${added}건, 중복 스킵: ${skippedDup}건, 태그 없음(검토완료 처리): ${noTag}건, 파일 없음: ${missing}건`);
console.log(`누적 검토 완료: ${reviewedSet.size}건`);
