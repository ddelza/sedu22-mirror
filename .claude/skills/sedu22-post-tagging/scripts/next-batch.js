// 아직 tags 필드 없는 게시글을 N개(기본 40) 찾아서, 분류에 필요한 최소 정보만
// 스크래치 폴더의 batch.json 파일로 뽑아준다. Claude가 이 파일을 읽고 분류한 뒤
// apply-batch.js로 결과를 다시 게시글 파일에 써넣는 2단계 흐름으로 쓴다.
//
// 사용법: node next-batch.js [배치크기] [출력경로]
// 기본 출력: <repo>/.claude/skills/sedu22-post-tagging/scratch/batch.json
const fs = require('fs');
const path = require('path');

const REPO = path.join(__dirname, '..', '..', '..', '..'); // .claude/skills/sedu22-post-tagging/scripts -> repo root
const POSTS_DIR = path.join(REPO, 'data', 'posts');
const BATCH_SIZE = Number(process.argv[2] || 40);
const OUT_PATH = process.argv[3] || path.join(__dirname, '..', 'scratch', 'batch.json');

// "게시판별 분류" 태그는 모든 글에 기계적으로 붙는 메타데이터라서 분류 완료 여부 판단에서는 무시한다.
function isClassified(post) {
  return !!(post.tags && post.tags.some(t => t.category !== '게시판별 분류'));
}

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

function findUntagged(limit) {
  const results = [];
  const fldids = fs.readdirSync(POSTS_DIR);
  for (const fldid of fldids) {
    const boardDir = path.join(POSTS_DIR, fldid);
    if (!fs.statSync(boardDir).isDirectory()) continue;
    for (const f of fs.readdirSync(boardDir)) {
      if (!f.endsWith('.json')) continue;
      const filePath = path.join(boardDir, f);
      const post = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      if (isClassified(post)) continue; // 이미 태깅됨(게시판 태그만 있는 경우는 미태깅으로 취급)
      results.push({
        id: `${post.fldid}-${post.dataid}`,
        board: post.boardName,
        title: post.title,
        content: stripHtml(post.contentHtml).slice(0, 1200),
      });
      if (results.length >= limit) return results;
    }
  }
  return results;
}

const batch = findUntagged(BATCH_SIZE);
fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
fs.writeFileSync(OUT_PATH, JSON.stringify(batch, null, 2));

// 남은 전체 미태깅 수도 같이 알려줌(진행률 파악용) - 전체를 다 세되 비용이 크지 않도록 카운트만
let totalUntagged = 0;
for (const fldid of fs.readdirSync(POSTS_DIR)) {
  const boardDir = path.join(POSTS_DIR, fldid);
  if (!fs.statSync(boardDir).isDirectory()) continue;
  for (const f of fs.readdirSync(boardDir)) {
    if (!f.endsWith('.json')) continue;
    const post = JSON.parse(fs.readFileSync(path.join(boardDir, f), 'utf8'));
    if (!isClassified(post)) totalUntagged++;
  }
}

console.log(`이번 배치: ${batch.length}건 -> ${OUT_PATH}`);
console.log(`전체 남은 미태깅: ${totalUntagged}건`);
