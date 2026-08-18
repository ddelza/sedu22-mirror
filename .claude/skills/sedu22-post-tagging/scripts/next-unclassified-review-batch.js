// 최근 1718건 첫 태깅에서 "미분류"로 빠진 글들을 다시 훑으면서,
// 교육과정 단원이나 "과학교사 업무"/"스마트 수업도구"/"수업 방법론" 카테고리로
// 재분류할 수 있는지 검토하기 위한 배치 추출 스크립트.
//
// 대상 게시판: KIr(자유공간), IWN(좋은 글 & 책), IYj(생각의 탄생), YNeK(지필 평가문항 공유&오류 논의)
//
// 사용법: node next-unclassified-review-batch.js [배치크기]
const fs = require('fs');
const path = require('path');

const REPO = path.join(__dirname, '..', '..', '..', '..');
const POSTS_DIR = path.join(REPO, 'data', 'posts');
const TARGET_FLDIDS = ['KIr', 'IWN', 'IYj', 'YNeK'];
const STATE_PATH = path.join(__dirname, '..', 'scratch', 'unclassified-review-state.json');
const OUT_PATH = path.join(__dirname, '..', 'scratch', 'unclassified-review-batch.json');
const BATCH_SIZE = Number(process.argv[2] || 40);

function stripHtml(html) {
  if (!html) return '';
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

let state = { reviewed: [] };
if (fs.existsSync(STATE_PATH)) state = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
const reviewedSet = new Set(state.reviewed);

function isUnclassified(post) {
  return !!(post.tags && post.tags.some(t => t.unit === '미분류'));
}

const results = [];
let totalUnclassified = 0;
let totalRemaining = 0;

for (const fldid of TARGET_FLDIDS) {
  const boardDir = path.join(POSTS_DIR, fldid);
  if (!fs.existsSync(boardDir)) continue;
  for (const f of fs.readdirSync(boardDir)) {
    if (!f.endsWith('.json')) continue;
    const filePath = path.join(boardDir, f);
    const post = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (!isUnclassified(post)) continue;
    totalUnclassified++;
    const id = `${post.fldid}-${post.dataid}`;
    if (reviewedSet.has(id)) continue;
    totalRemaining++;
    if (results.length < BATCH_SIZE) {
      results.push({
        id,
        board: post.boardName,
        title: post.title,
        tagsNote: post.tagsNote || '',
        content: stripHtml(post.contentHtml).slice(0, 1200),
      });
    }
  }
}

fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
fs.writeFileSync(OUT_PATH, JSON.stringify(results, null, 2));

console.log(`이번 배치: ${results.length}건 -> ${OUT_PATH}`);
console.log(`미분류 전체: ${totalUnclassified}건 / 아직 검토 안 한: ${totalRemaining}건`);
