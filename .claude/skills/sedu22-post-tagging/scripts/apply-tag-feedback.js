// fetch-tag-feedback.js로 가져온 배치를 검토한 결과(scratch/tag-feedback-result.json)를
// data/posts/<fldid>/<dataid>.json에 반영하고, 처리한 Sheet 행을 status=applied로 되돌려 표시한다.
//
// 입력 형식: [{ postId, source, row, tags: [...새로 추가할 태그만...] | null, removeTags: [...삭제할 태그 객체...] | null }, ...]
// 처리하지 않기로 한 항목(예: 이미 있는 태그였다/오제보였다)도 반드시 포함시켜야 Sheet에서 applied로 표시된다
// (그 경우 tags: null, removeTags: null로 써도 된다 — data/posts는 안 바뀌고 Sheet 상태만 넘어간다).
//
// 사용법: node apply-tag-feedback.js [입력경로]
const fs = require('fs');
const path = require('path');

// fetch-tag-feedback.js / explore.html / admin.html과 반드시 동일한 /exec URL을 넣을 것.
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzftNdV5EDrQDyDIof-lc4YBUznYMrFy0Ec9qX8VkVZzkM1TwDso6Uul24wGGFfdciT/exec';
const ADMIN_PASSWORD = 'sedu26ai';

const REPO = path.join(__dirname, '..', '..', '..', '..');
const POSTS_DIR = path.join(REPO, 'data', 'posts');
const IN_PATH = process.argv[2] || path.join(__dirname, '..', 'scratch', 'tag-feedback-result.json');

async function main() {
  const results = JSON.parse(fs.readFileSync(IN_PATH, 'utf8'));
  let added = 0, removed = 0, noChange = 0, missing = 0;
  const bySheet = { suggestion: [], adminEdit: [] };

  for (const item of results) {
    const [fldid, dataid] = item.postId.split('-');
    const filePath = path.join(POSTS_DIR, fldid, `${dataid}.json`);
    if (!fs.existsSync(filePath)) {
      console.error(`파일 없음: ${filePath} (postId=${item.postId})`);
      missing++;
    } else {
      const post = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      if (!post.tags) post.tags = [];
      let changed = false;
      if (item.tags && item.tags.length) {
        const existingKeys = new Set(post.tags.map((t) => JSON.stringify(t)));
        for (const tag of item.tags) {
          const key = JSON.stringify(tag);
          if (existingKeys.has(key)) continue;
          post.tags.push(tag);
          existingKeys.add(key);
          changed = true;
          added++;
        }
      }
      if (item.removeTags && item.removeTags.length) {
        const removeKeys = new Set(item.removeTags.map((t) => JSON.stringify(t)));
        const before = post.tags.length;
        post.tags = post.tags.filter((t) => !removeKeys.has(JSON.stringify(t)));
        if (post.tags.length !== before) {
          changed = true;
          removed += before - post.tags.length;
        }
      }
      if (changed) {
        post.taggedAt = new Date().toISOString();
        fs.writeFileSync(filePath, JSON.stringify(post, null, 2));
      } else {
        noChange++;
      }
    }
    const sheetKey = item.source === 'adminEdit' ? 'adminEdit' : 'suggestion';
    if (item.row) bySheet[sheetKey].push(item.row);
  }

  console.log(`태그 추가: ${added}건, 태그 삭제: ${removed}건, 변경없음: ${noChange}건, 파일 없음: ${missing}건`);

  if (!APPS_SCRIPT_URL || APPS_SCRIPT_URL.startsWith('PASTE_')) {
    console.log('APPS_SCRIPT_URL이 설정되지 않아 Sheet 상태(status=applied) 반영은 건너뜁니다.');
    return;
  }
  for (const [sheet, rows] of Object.entries(bySheet)) {
    if (!rows.length) continue;
    const sheetName = sheet === 'adminEdit' ? 'adminEdits' : 'suggestions';
    const res = await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'markApplied', password: ADMIN_PASSWORD, sheet: sheetName, rows }),
    });
    const data = await res.json();
    console.log(`${sheetName} 시트 ${rows.length}행 처리 표시:`, data.ok ? '성공' : data.error);
  }
}

main();
