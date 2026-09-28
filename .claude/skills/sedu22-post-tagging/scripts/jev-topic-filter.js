// 옵션 C(이미 태깅된 글 전체 소급 재검토)용 Jev 1차 필터.
// next-topic-retro-review-batch.js로 뽑아둔 scratch/topic-retro-review-batch.json을 읽어서
// 각 글이 "기존 태그에 없는 특수 topic"을 추가로 다루고 있을 가능성을 Jev로 채점한다.
//
// 결과:
//  - scratch/topic-retro-review-result.json : 배치 전체에 대해 { id, tags: null } 기본값으로 채워둠
//    (Claude가 실제로 새 태그를 찾으면 해당 항목만 tags를 채워 덮어쓰면 됨 — apply 시 전체가 reviewed 처리됨)
//  - scratch/board-review.json : threshold 이상인 것만 {id, title, existingTags, content, jevScore} 로 추려서 저장
//    (이것만 Claude가 실제로 읽고 판단)
//
// 사용법: node jev-topic-filter.js [threshold]  (기본 0.15)
const fs = require('fs');
const path = require('path');

const THRESHOLD = process.argv[2] ? parseFloat(process.argv[2]) : 0.15;

const SCRATCH = path.join(__dirname, '..', 'scratch');
const BATCH_PATH = path.join(SCRATCH, 'topic-retro-review-batch.json');
const RESULT_PATH = path.join(SCRATCH, 'topic-retro-review-result.json');
const REVIEW_PATH = path.join(SCRATCH, 'board-review.json');

const ROOT = path.join(__dirname, '..', '..', '..', '..');
const KEY_FILE = path.join(ROOT, '.jev-key');
const API_KEY = process.env.JEV_API_KEY || (fs.existsSync(KEY_FILE) ? fs.readFileSync(KEY_FILE, 'utf8').trim() : null);
if (!API_KEY) {
  console.error('JEV_API_KEY 환경변수나 .jev-key 파일이 필요합니다.');
  process.exit(1);
}
const API_URL = 'https://api.typesafe.ai/v1/systemone';

const INSTRUCTIONS = '이 다음카페(과학교사 커뮤니티) 게시글에는 이미 [기존 태그] 목록의 태그가 붙어있다. ' +
  '그런데 [기존 태그]에는 없는 아래 주제 중 하나 이상을 이 글이 추가로, 구체적으로 다루고 있는가: ' +
  '(1) 과학교사 업무 — 본인이 참석한 교원연수, 반복 운영되는 학급운영 제도(도장판/보상제도), 세특작성 목적의 활동설계, ' +
  '생활지도 대응 대화, 영재학급 운영, 과학행사 기획, 과학실 관리, 과학동아리 운영. ' +
  '(2) 스마트 수업도구 — MBL센서, 아두이노, 구체적 앱/프로그램 실사용, 생성형 AI 도구(ChatGPT/Notebook LM/Vrew 등) 실사용, ' +
  'AR/VR, 교육용 태블릿/크롬북, 3D프린팅/메이커. ' +
  '(3) 수업 방법론 — 거꾸로교실, IB(개념기반학습), 배움중심수업, 토론수업/하브루타를 본인 수업에 적용. ' +
  '(4) 재과만 소식 — 카페 운영진의 공식 공지, 가입인사. ' +
  '[기존 태그]에 이미 있는 항목은 제외하고, 새로 추가할 만한 것이 있는지만 판단한다.';

function buildBody(item) {
  const existing = (item.existingTags || [])
    .map((t) => (t.unit ? `${t.unit}` : `${t.category}/${t.topic}`))
    .join(', ');
  const state = `게시판: ${item.board}\n제목: ${item.title}\n기존 태그: ${existing || '(없음)'}\n본문: ${item.content}`;
  return JSON.stringify({
    state,
    model: 'jev-latest',
    questions: {
      new_topic: { type: 'noul', instructions: INSTRUCTIONS, criteria: { true: '해당', false: '해당 없음' } },
    },
  });
}

async function scoreOne(item) {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
    body: buildBody(item),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  return data?.answers?.new_topic?.noul ?? null;
}

(async () => {
  if (!fs.existsSync(BATCH_PATH)) {
    console.error('scratch/topic-retro-review-batch.json 이 없습니다. 먼저 next-topic-retro-review-batch.js를 실행하세요.');
    process.exit(1);
  }
  const batch = JSON.parse(fs.readFileSync(BATCH_PATH, 'utf8'));
  console.log(`배치 ${batch.length}건, Jev 채점 시작 (threshold=${THRESHOLD})...`);

  const resultDefaults = [];
  const passed = [];
  let errors = 0;

  for (const item of batch) {
    resultDefaults.push({ id: item.id, tags: null });
    try {
      const score = await scoreOne(item);
      if (score >= THRESHOLD) {
        passed.push({ id: item.id, title: item.title, existingTags: item.existingTags, content: item.content, jevScore: score });
      }
    } catch (e) {
      errors++;
      // 오류난 건은 안전하게 통과시켜 사람이 직접 판단하도록 한다
      passed.push({ id: item.id, title: item.title, existingTags: item.existingTags, content: item.content, jevScore: 1, errored: true });
    }
  }

  passed.sort((a, b) => b.jevScore - a.jevScore);

  fs.writeFileSync(RESULT_PATH, JSON.stringify(resultDefaults, null, 2));
  fs.writeFileSync(REVIEW_PATH, JSON.stringify(passed, null, 2));

  console.log(`\n필터 통과(직접 읽어야 함): ${passed.length}건 / 전체 ${batch.length}건 (${Math.round((1 - passed.length / batch.length) * 100)}% 절감)`);
  if (errors) console.log(`API 오류로 안전하게 통과시킨 건: ${errors}건`);
  console.log(`- ${path.relative(ROOT, REVIEW_PATH)} : 직접 읽고 판단할 목록`);
  console.log(`- ${path.relative(ROOT, RESULT_PATH)} : 전체 tags:null 기본값 (판단한 것만 덮어써서 채우면 됨)`);
})();
