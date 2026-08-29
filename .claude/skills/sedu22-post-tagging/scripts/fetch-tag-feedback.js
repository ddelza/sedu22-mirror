// backend/Code.gs(Apps Script)에 쌓인 "제안"(explore.html 태그 제보) / "관리자수정"(admin.html)을
// 가져와 scratch/tag-feedback-batch.json에 저장한다. Claude Code가 이 배치를 검토해서
// scratch/tag-feedback-result.json을 작성하면 apply-tag-feedback.js가 data/posts/*.json에 반영한다.
//
// 사용법: node fetch-tag-feedback.js
const fs = require('fs');
const path = require('path');

// backend/Code.gs를 배포한 뒤 그 /exec URL로 아래를 고쳐야 한다.
// (explore.html / admin.html의 APPS_SCRIPT_URL, apply-tag-feedback.js와 반드시 동일하게 맞출 것)
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzftNdV5EDrQDyDIof-lc4YBUznYMrFy0Ec9qX8VkVZzkM1TwDso6Uul24wGGFfdciT/exec';
const ADMIN_PASSWORD = 'sedu26ai';

const OUT_PATH = path.join(__dirname, '..', 'scratch', 'tag-feedback-batch.json');

async function main() {
  if (!APPS_SCRIPT_URL || APPS_SCRIPT_URL.startsWith('PASTE_')) {
    console.error('APPS_SCRIPT_URL이 아직 설정되지 않았습니다. 이 파일 상단을 배포된 /exec URL로 고쳐주세요.');
    process.exit(1);
  }
  const url = `${APPS_SCRIPT_URL}?action=list&password=${encodeURIComponent(ADMIN_PASSWORD)}`;
  const data = await (await fetch(url)).json();
  if (!data.ok) {
    console.error('불러오기 실패:', data.error);
    process.exit(1);
  }
  const items = [
    ...data.suggestions.map((r) => ({
      source: 'suggestion', row: r._row, postId: r.postId, postTitle: r.postTitle,
      addTags: r.addTags || [], removeTags: r.removeTags || [], newTagNote: r.newTagNote || '',
      note: r.note, timestamp: r.timestamp,
    })),
    ...data.adminEdits.map((r) => ({
      source: 'adminEdit', row: r._row, postId: r.postId, postTitle: r.postTitle,
      addTags: r.addTags || [], removeTags: r.removeTags || [], newTagNote: r.newTagNote || '',
      note: r.note, timestamp: r.timestamp,
    })),
  ];
  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(items, null, 2));
  console.log(`제안 ${data.suggestions.length}건, 관리자수정 ${data.adminEdits.length}건 -> ${OUT_PATH}`);
}

main();
