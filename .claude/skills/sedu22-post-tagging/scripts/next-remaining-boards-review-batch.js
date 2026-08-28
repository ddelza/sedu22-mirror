// "재과만 소식"(가입인사/카페 운영 공지), 영재교육, 토론수업 기준 신설 이후,
// 아직 새 기준으로 재검토되지 않은 나머지 게시판들의 미분류 글을 훑기 위한 배치 스크립트.
// (KIr/IWN/IYj/YNeK는 unclassified-review 1차 재검토로, eyXe/fDsg/f7Cv/fBlk/fEZu/fBlf/fF5f는
//  jaegwaman-board-review 전수 스캔으로 이미 새 기준까지 반영되어 제외한다.)
//
// 사용법: node next-remaining-boards-review-batch.js [배치크기]
const fs = require('fs');
const path = require('path');

const REPO = path.join(__dirname, '..', '..', '..', '..');
const POSTS_DIR = path.join(REPO, 'data', 'posts');
const EXCLUDE_FLDIDS = new Set(['KIr', 'IWN', 'IYj', 'YNeK', 'eyXe', 'fDsg', 'f7Cv', 'fBlk', 'fEZu', 'fBlf', 'fF5f']);
const STATE_PATH = path.join(__dirname, '..', 'scratch', 'remaining-boards-review-state.json');
const OUT_PATH = path.join(__dirname, '..', 'scratch', 'remaining-boards-review-batch.json');
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

const boardDirs = fs.readdirSync(POSTS_DIR).filter(f => fs.statSync(path.join(POSTS_DIR, f)).isDirectory());

for (const fldid of boardDirs) {
  if (EXCLUDE_FLDIDS.has(fldid)) continue;
  const boardDir = path.join(POSTS_DIR, fldid);
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
console.log(`대상 게시판(11개 제외) 미분류 전체: ${totalUnclassified}건 / 아직 검토 안 한: ${totalRemaining}건`);
