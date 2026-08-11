// Claude가 분류한 결과(id, tags, tagsNote 배열)를 읽어서 각 게시글 JSON 파일에
// tags/tagsNote/taggedAt 필드로 써넣는다.
//
// 사용법: node apply-batch.js [결과경로]
// 기본 입력: <repo>/.claude/skills/sedu22-post-tagging/scratch/result.json
// 결과 형식: [{ "id": "fldid-dataid", "tags": [...], "tagsNote": "..." }, ...]
const fs = require('fs');
const path = require('path');

const REPO = path.join(__dirname, '..', '..', '..', '..');
const POSTS_DIR = path.join(REPO, 'data', 'posts');
const IN_PATH = process.argv[2] || path.join(__dirname, '..', 'scratch', 'result.json');

const results = JSON.parse(fs.readFileSync(IN_PATH, 'utf8'));

let applied = 0;
let missing = 0;
let alreadyTagged = 0;

for (const item of results) {
  const [fldid, dataid] = item.id.split('-');
  const filePath = path.join(POSTS_DIR, fldid, `${dataid}.json`);
  if (!fs.existsSync(filePath)) {
    console.error(`파일 없음: ${filePath} (id=${item.id})`);
    missing++;
    continue;
  }
  const post = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  // "게시판별 분류" 태그는 모든 글에 기계적으로 붙는 메타데이터라서 분류 완료 여부 판단에서는 무시한다.
  const isClassified = post.tags && post.tags.some(t => t.category !== '게시판별 분류');
  if (isClassified) {
    alreadyTagged++;
    continue; // 이미 태깅된 건 덮어쓰지 않음(중복 처리 방지)
  }
  if (!post.tags) post.tags = [];
  if (!item.tags || item.tags.length === 0) {
    console.error(`경고: id=${item.id} tags가 비어있음(미분류 항목이라도 반드시 있어야 함) — 건너뜀`);
    continue;
  }
  post.tags = [...post.tags, ...item.tags]; // 기존 "게시판별 분류" 태그는 보존하고 새 태그를 이어붙임
  post.tagsNote = item.tagsNote || '';
  post.taggedAt = new Date().toISOString();
  fs.writeFileSync(filePath, JSON.stringify(post, null, 2));
  applied++;
}

console.log(`적용 완료: ${applied}건, 이미 태깅되어 스킵: ${alreadyTagged}건, 파일 없음: ${missing}건`);
