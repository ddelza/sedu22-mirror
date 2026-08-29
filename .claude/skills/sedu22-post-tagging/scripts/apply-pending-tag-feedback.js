// admin.html "미처리 제보/수정" 큐에 남아있는 항목을 전부 기계적으로 반영한다.
// Claude나 사람이 여기서 내용을 다시 판단하지 않는다 — 뭘 반영할지 거르는 건 이미
// admin.html에서 관리자(운영진)가 미리 수정/삭제로 끝내둔다는 전제다. 이 스크립트를
// 실행하라는 요청을 받으면 큐에 남은 걸 예외 없이 그대로 적용한다.
//
// addTags/removeTags가 있는 항목만 실제로 data/posts/*.json을 바꾼다. newTagNote만 있고
// addTags/removeTags가 둘 다 비어있는 항목(= taxonomy에 없어서 자유 텍스트로 남겨진 채
// 관리자가 아직 정식 태그로 변환 안 한 것)은 바꿀 게 없어서 그냥 큐에서만 빠진다 — 시트에는
// status=applied로 기록이 남으니 나중에 시트에서 다시 확인할 수 있다.
//
// 사용법: node apply-pending-tag-feedback.js
const fs = require('fs');
const path = require('path');

// explore.html / admin.html / backend/Code.gs와 반드시 동일한 /exec URL을 넣을 것.
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzftNdV5EDrQDyDIof-lc4YBUznYMrFy0Ec9qX8VkVZzkM1TwDso6Uul24wGGFfdciT/exec';
const ADMIN_PASSWORD = 'sedu26ai';

const REPO = path.join(__dirname, '..', '..', '..', '..');
const POSTS_DIR = path.join(REPO, 'data', 'posts');

async function main() {
  const listUrl = `${APPS_SCRIPT_URL}?action=list&password=${encodeURIComponent(ADMIN_PASSWORD)}`;
  const data = await (await fetch(listUrl)).json();
  if (!data.ok) {
    console.error('불러오기 실패:', data.error);
    process.exit(1);
  }

  const items = [
    ...data.suggestions.map((r) => ({ ...r, sheet: 'suggestions' })),
    ...data.adminEdits.map((r) => ({ ...r, sheet: 'adminEdits' })),
  ];
  if (!items.length) {
    console.log('대기 중인 항목이 없습니다.');
    return;
  }

  let added = 0, removed = 0, noop = 0, missing = 0, freeTextOnly = 0;
  const bySheet = { suggestions: [], adminEdits: [] };

  for (const item of items) {
    const [fldid, dataid] = (item.postId || '').split('-');
    const filePath = fldid && dataid ? path.join(POSTS_DIR, fldid, `${dataid}.json`) : null;
    if (!filePath || !fs.existsSync(filePath)) {
      console.error(`파일 없음: postId=${item.postId}`);
      missing++;
    } else {
      const post = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      if (!post.tags) post.tags = [];
      let changed = false;
      if (item.addTags && item.addTags.length) {
        const existingKeys = new Set(post.tags.map((t) => JSON.stringify(t)));
        for (const tag of item.addTags) {
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
        noop++;
        if (item.newTagNote) freeTextOnly++;
      }
    }
    if (item._row) bySheet[item.sheet].push(item._row);
  }

  console.log(`태그 추가: ${added}건, 태그 삭제: ${removed}건, 변경없음: ${noop}건(그중 새태그 자유제안만 있던 건: ${freeTextOnly}건), 파일 없음: ${missing}건`);

  for (const [sheet, rows] of Object.entries(bySheet)) {
    if (!rows.length) continue;
    const res = await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'markApplied', password: ADMIN_PASSWORD, sheet, rows }),
    });
    const result = await res.json();
    console.log(`${sheet} 시트 ${rows.length}행 처리 표시:`, result.ok ? '성공' : result.error);
  }

  if (added > 0 || removed > 0) {
    console.log('반영 완료 — node build-site-data.js 로 재빌드한 뒤 커밋/푸시하세요.');
  }
}

main();
