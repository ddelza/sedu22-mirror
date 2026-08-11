// 모든 게시글에 "게시판별 분류" 카테고리 태그를 기계적으로 붙인다.
// AI 판단이 필요 없는 메타데이터(게시글의 boardName 필드를 그대로 태그화)라서
// 이미 태깅된 글이든 아직 안 된 글이든 상관없이 전체에 적용한다.
// 이미 이 카테고리 태그가 있으면 건드리지 않는다(재실행해도 안전).
//
// 사용법: node add-board-tags.js
const fs = require('fs');
const path = require('path');

const REPO = path.join(__dirname, '..', '..', '..', '..');
const POSTS_DIR = path.join(REPO, 'data', 'posts');

let added = 0;
let alreadyHad = 0;

for (const fldid of fs.readdirSync(POSTS_DIR)) {
  const boardDir = path.join(POSTS_DIR, fldid);
  if (!fs.statSync(boardDir).isDirectory()) continue;
  for (const f of fs.readdirSync(boardDir)) {
    if (!f.endsWith('.json')) continue;
    const filePath = path.join(boardDir, f);
    const post = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (!post.tags) post.tags = [];
    const hasBoardTag = post.tags.some(t => t.category === '게시판별 분류');
    if (hasBoardTag) {
      alreadyHad++;
      continue;
    }
    post.tags.push({ category: '게시판별 분류', topic: post.boardName, confidence: 'high' });
    fs.writeFileSync(filePath, JSON.stringify(post, null, 2));
    added++;
  }
}

console.log(`게시판 태그 추가: ${added}건, 이미 있어서 스킵: ${alreadyHad}건`);
