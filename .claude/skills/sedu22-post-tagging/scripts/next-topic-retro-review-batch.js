// 옵션 C: phase B(48개 게시판 미분류 전수검토) 도중 새로 확정된 특수 카테고리 topic들
// (과학교사 업무: 세특작성/교원연수/과학실 관리/동아리 운영/영재교육/학급운영/과학 행사/생활지도,
//  스마트 수업도구: 생성형 AI 도구/MBL센서/앱/프로그램/..., 재과만 소식: 카페 운영 공지,
//  수업 방법론: 토론수업(하브루타 포함)/IB(개념기반학습)/배움중심수업/거꾸로 교실)
// 을 이미 태깅이 끝난(단원 태그든 미분류든 상관없이 tags가 존재하는) 글 전체에서
// 놓치지 않았는지 처음부터 순서대로 다시 훑기 위한 배치 추출 스크립트.
//
// next-remaining-boards-review-batch.js와 달리 대상은 "게시판 제한 없이 이미 태깅된 글 전체"이며,
// 진행 상태를 scratch/topic-retro-review-state.json에 저장해 재실행해도 처음부터 다시 훑지 않는다.
//
// 사용법: node next-topic-retro-review-batch.js [배치크기]
const fs = require('fs');
const path = require('path');

const REPO = path.join(__dirname, '..', '..', '..', '..');
const POSTS_DIR = path.join(REPO, 'data', 'posts');
const STATE_PATH = path.join(__dirname, '..', 'scratch', 'topic-retro-review-state.json');
const OUT_PATH = path.join(__dirname, '..', 'scratch', 'topic-retro-review-batch.json');
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

function isClassified(post) {
  return !!(post.tags && post.tags.some(t => t.category !== '게시판별 분류'));
}

let state = { reviewed: [] };
if (fs.existsSync(STATE_PATH)) state = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
const reviewedSet = new Set(state.reviewed);

const results = [];
let totalClassified = 0;
let totalRemaining = 0;

const fldids = fs.readdirSync(POSTS_DIR).sort();
for (const fldid of fldids) {
  const boardDir = path.join(POSTS_DIR, fldid);
  if (!fs.statSync(boardDir).isDirectory()) continue;
  for (const f of fs.readdirSync(boardDir).sort()) {
    if (!f.endsWith('.json')) continue;
    const filePath = path.join(boardDir, f);
    const post = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (!isClassified(post)) continue; // 아직 태깅 안 된 글은 이 재검토 대상이 아님
    totalClassified++;
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
console.log(`이미 태깅된 전체: ${totalClassified}건 / 아직 재검토 안 한: ${totalRemaining}건`);
