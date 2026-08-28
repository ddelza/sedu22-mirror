// "재과만 소식"(가입인사/카페 운영 공지) 카테고리 신설 이후, 그 태그가 집중될 것으로
// 예상되는 카페 운영 관련 게시판들을 미분류 여부와 무관하게 전수 재검토하기 위한 배치 스크립트.
// (next-unclassified-review-batch.js는 이미 tags가 있는 글은 건너뛰므로 이 용도로 쓸 수 없다.)
//
// 대상 게시판: eyXe(★처음 오신 선생님들께☆), fDsg(재과만 공지), f7Cv(재과만 talk talk 행사 안내),
//              fBlk(재과만 정기행사), fEZu((월간) 재과만 이야기), fBlf(재과만 talk 영상(1회~100회)),
//              fF5f(단톡방의 기록)
//
// 사용법: node next-jaegwaman-board-batch.js [배치크기]
const fs = require('fs');
const path = require('path');

const REPO = path.join(__dirname, '..', '..', '..', '..');
const POSTS_DIR = path.join(REPO, 'data', 'posts');
const TARGET_FLDIDS = ['eyXe', 'fDsg', 'f7Cv', 'fBlk', 'fEZu', 'fBlf', 'fF5f'];
const STATE_PATH = path.join(__dirname, '..', 'scratch', 'jaegwaman-board-review-state.json');
const OUT_PATH = path.join(__dirname, '..', 'scratch', 'jaegwaman-board-batch.json');
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

const results = [];
let totalPosts = 0;
let totalRemaining = 0;

for (const fldid of TARGET_FLDIDS) {
  const boardDir = path.join(POSTS_DIR, fldid);
  if (!fs.existsSync(boardDir)) continue;
  for (const f of fs.readdirSync(boardDir)) {
    if (!f.endsWith('.json')) continue;
    const filePath = path.join(boardDir, f);
    const post = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    totalPosts++;
    const id = `${post.fldid}-${post.dataid}`;
    if (reviewedSet.has(id)) continue;
    totalRemaining++;
    if (results.length < BATCH_SIZE) {
      const existingTags = (post.tags || []).filter(t => t.topic !== post.boardName);
      results.push({
        id,
        board: post.boardName,
        title: post.title,
        existingTags,
        content: stripHtml(post.contentHtml).slice(0, 1200),
      });
    }
  }
}

fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
fs.writeFileSync(OUT_PATH, JSON.stringify(results, null, 2));

console.log(`이번 배치: ${results.length}건 -> ${OUT_PATH}`);
console.log(`대상 게시판 전체: ${totalPosts}건 / 아직 검토 안 한: ${totalRemaining}건`);
