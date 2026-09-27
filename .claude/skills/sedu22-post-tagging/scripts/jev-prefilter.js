// 게시판별 미분류 후보를 Jev(TypeSafe AI System One)로 1차 필터링한다.
// 사용법: node .claude/skills/sedu22-post-tagging/scripts/jev-prefilter.js <fldid> [threshold]
//   threshold 기본값 0.15 (재현율 우선 — 놓치는 것보다 몇 개 더 읽는 게 낫다는 판단)
// 결과: scratch/board-review.json 에 threshold 이상인 후보만 저장 (점수 내림차순).
//       필터 통과/탈락 통계도 콘솔에 출력.
const fs = require('fs');
const path = require('path');

const fldid = process.argv[2];
const THRESHOLD = process.argv[3] ? parseFloat(process.argv[3]) : 0.15;
if (!fldid) {
  console.error('사용법: node jev-prefilter.js <fldid> [threshold]');
  process.exit(1);
}

const ROOT = path.join(__dirname, '..', '..', '..', '..');
const KEY_FILE = path.join(ROOT, '.jev-key');
const API_KEY = process.env.JEV_API_KEY || (fs.existsSync(KEY_FILE) ? fs.readFileSync(KEY_FILE, 'utf8').trim() : null);
if (!API_KEY) {
  console.error('JEV_API_KEY 환경변수나 .jev-key 파일이 필요합니다.');
  process.exit(1);
}

const API_URL = 'https://api.typesafe.ai/v1/systemone';

const INSTRUCTIONS = '이 다음카페(과학교사 커뮤니티) 게시글이 아래 중 하나 이상에 해당하는 구체적인 내용을 담고 있는가: ' +
  '(1) 특정 교육과정 단원의 수업 내용·활동을 실제로 설명, ' +
  '(2) 과학교사 업무(본인이 참석한 교원연수, 반복 운영되는 학급운영 제도, 세특작성 목적의 활동설계, 생활지도 대응, 영재학급 운영, 과학행사 기획, 과학실 관리, 과학동아리 운영)를 구체적으로 다룸, ' +
  '(3) 스마트 수업도구(MBL센서, 아두이노, 앱/프로그램, 생성형 AI 도구, AR/VR, 교육용 단말기, 3D프린팅)를 수업에 실제로 활용한 내용, ' +
  '(4) 수업 방법론(거꾸로교실, IB, 배움중심수업, 토론수업/하브루타)을 본인 수업에 적용한 사례. ' +
  '단순 잡담, 행정/공문 문의, 공지, 감사인사, 일반적 조언 요청, 자료 링크만 공유, 개인 일기/에세이는 해당 없음.';

function stripHtml(html) {
  if (!html) return '';
  return html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&#160;/g, ' ').replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();
}

function buildBody(board, title, content) {
  const state = `게시판: ${board}\n제목: ${title}\n본문: ${content}`;
  return JSON.stringify({
    state,
    model: 'jev-latest',
    questions: {
      worth_review: { type: 'noul', instructions: INSTRUCTIONS, criteria: { true: '해당', false: '해당 없음' } },
    },
  });
}

async function scoreOne(board, title, content) {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
    body: buildBody(board, title, content),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  return data?.answers?.worth_review?.noul ?? null;
}

(async () => {
  const dir = path.join(ROOT, 'data', 'posts', fldid);
  if (!fs.existsSync(dir)) {
    console.error('게시판 없음:', dir);
    process.exit(1);
  }

  const candidates = [];
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.json')) continue;
    const post = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    if ((post.tags || []).some((t) => t.unit === '미분류')) {
      candidates.push({
        id: `${post.fldid}-${post.dataid}`,
        board: post.boardName || post.fldid,
        title: post.title,
        content: stripHtml(post.contentHtml).slice(0, 1200),
      });
    }
  }

  console.log(`${fldid}: 미분류 후보 ${candidates.length}건, Jev 채점 시작 (threshold=${THRESHOLD})...`);

  const scored = [];
  let errors = 0;
  for (const c of candidates) {
    try {
      const score = await scoreOne(c.board, c.title, c.content);
      scored.push({ ...c, score });
    } catch (e) {
      errors++;
      console.log(`  [오류] ${c.id}: ${e.message}`);
      // 오류난 건은 안전하게 통과시켜 사람이 직접 판단하도록 한다
      scored.push({ ...c, score: 1, errored: true });
    }
  }

  const passed = scored.filter((s) => s.score >= THRESHOLD).sort((a, b) => b.score - a.score);
  const dropped = scored.length - passed.length;

  const outPath = path.join(__dirname, '..', 'scratch', 'board-review.json');
  fs.writeFileSync(
    outPath,
    JSON.stringify(passed.map(({ id, title, content, score }) => ({ id, title, content, jevScore: score })), null, 2)
  );

  const allScoresPath = path.join(__dirname, '..', 'scratch', 'jev-prefilter-all-scores.json');
  fs.writeFileSync(
    allScoresPath,
    JSON.stringify(scored.map(({ id, title, score }) => ({ id, title, score })).sort((a, b) => b.score - a.score), null, 2)
  );

  console.log(`\n필터 통과: ${passed.length}건 (읽어야 할 양 ${candidates.length}건 → ${passed.length}건, ${Math.round((1 - passed.length / candidates.length) * 100)}% 절감)`);
  console.log(`필터 탈락(미리보기 스킵): ${dropped}건`);
  if (errors) console.log(`API 오류로 안전하게 통과시킨 건: ${errors}건`);
  console.log(`저장: ${path.relative(ROOT, outPath)}`);
})();
