// 이미 "고등학교" 실단원으로 태깅된 게시글을 처음부터 순서대로 다시 훑으면서,
// 2015/2022 교차 태그(수평 매핑, curriculum/hs-2015-2022-mapping.md 참고)나
// 중학교 태그(수직 매핑, curriculum/ms-hs-vertical-mapping.md 참고)를 추가로
// 붙일 수 있는지 검토하기 위한 배치 추출 스크립트.
//
// next-ms-review-batch.js의 고등학교 버전. 대상만 "이미 고등학교로 태깅된 글"로 바뀐다.
//
// 사용법: node next-hs-review-batch.js [배치크기]
const fs = require('fs');
const path = require('path');

const REPO = path.join(__dirname, '..', '..', '..', '..');
const POSTS_DIR = path.join(REPO, 'data', 'posts');
const STATE_PATH = path.join(__dirname, '..', 'scratch', 'hs-review-state.json');
const OUT_PATH = path.join(__dirname, '..', 'scratch', 'hs-review-batch.json');
const BATCH_SIZE = Number(process.argv[2] || 20);

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

function isHsTagged(post) {
  return !!(post.tags && post.tags.some(t => t.schoolLevel === '고등학교' && t.unit && t.unit !== '미분류'));
}

const results = [];
let totalHsTagged = 0;
let totalRemaining = 0;

const fldids = fs.readdirSync(POSTS_DIR);
for (const fldid of fldids) {
  const boardDir = path.join(POSTS_DIR, fldid);
  if (!fs.statSync(boardDir).isDirectory()) continue;
  for (const f of fs.readdirSync(boardDir)) {
    if (!f.endsWith('.json')) continue;
    const filePath = path.join(boardDir, f);
    const post = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (!isHsTagged(post)) continue;
    totalHsTagged++;
    const id = `${post.fldid}-${post.dataid}`;
    if (reviewedSet.has(id)) continue;
    totalRemaining++;
    if (results.length < BATCH_SIZE) {
      results.push({
        id,
        board: post.boardName,
        title: post.title,
        existingTags: (post.tags || []).filter(t => t.category !== '게시판별 분류'),
        content: stripHtml(post.contentHtml).slice(0, 1200),
      });
    }
  }
}

fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
fs.writeFileSync(OUT_PATH, JSON.stringify(results, null, 2));

console.log(`이번 배치: ${results.length}건 -> ${OUT_PATH}`);
console.log(`고등학교 태깅된 전체: ${totalHsTagged}건 / 아직 검토 안 한: ${totalRemaining}건`);
