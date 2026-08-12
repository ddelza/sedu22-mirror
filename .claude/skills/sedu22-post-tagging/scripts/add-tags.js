// 이미 태깅된 게시글에 태그를 "추가"로 덧붙인다(기존 tags 배열은 덮어쓰지 않고 뒤에 이어붙임).
// 새 분류 기준(예: 과학교사 업무 카테고리)이 생겼을 때, 이미 지나간 배치들을 다시 훑어보며
// 놓친 태그를 보충하는 용도 — apply-batch.js는 안전을 위해 이미 태깅된 파일을 건너뛰므로
// 이 스크립트가 그 역할을 대신한다.
//
// 사용법: node add-tags.js [입력경로]
// 기본 입력: <repo>/.claude/skills/sedu22-post-tagging/scratch/add-result.json
// 입력 형식: [{ "id": "fldid-dataid", "tags": [...추가할 태그들...] }, ...]
// 같은 태그(JSON 문자열 비교)가 이미 있으면 중복 추가하지 않는다.
const fs = require('fs');
const path = require('path');

const REPO = path.join(__dirname, '..', '..', '..', '..');
const POSTS_DIR = path.join(REPO, 'data', 'posts');
const IN_PATH = process.argv[2] || path.join(__dirname, '..', 'scratch', 'add-result.json');

const results = JSON.parse(fs.readFileSync(IN_PATH, 'utf8'));

let added = 0;
let skippedDup = 0;
let missing = 0;

for (const item of results) {
  const [fldid, dataid] = item.id.split('-');
  const filePath = path.join(POSTS_DIR, fldid, `${dataid}.json`);
  if (!fs.existsSync(filePath)) {
    console.error(`파일 없음: ${filePath} (id=${item.id})`);
    missing++;
    continue;
  }
  const post = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if (!post.tags) post.tags = [];
  const existingKeys = new Set(post.tags.map(t => JSON.stringify(t)));
  for (const tag of item.tags || []) {
    const key = JSON.stringify(tag);
    if (existingKeys.has(key)) {
      skippedDup++;
      continue;
    }
    post.tags.push(tag);
    existingKeys.add(key);
    added++;
  }
  fs.writeFileSync(filePath, JSON.stringify(post, null, 2));
}

console.log(`추가 완료: ${added}건, 중복이라 스킵: ${skippedDup}건, 파일 없음: ${missing}건`);
