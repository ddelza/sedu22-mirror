// data/posts/**/*.json 을 훑어서 아직 태깅 안 된 게시글에 교육과정 단원 태그를 붙인다.
// Gemini API(무료/저가 Flash 모델) 사용. 게시판당 133개 단원 인덱스 + 게시글 내용을 한 번에 보내
// 가장 잘 맞는 단원 0~2개(또는 "해당없음")를 JSON으로 받아온다.
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data', 'posts');
const UNIT_INDEX_PATH = path.join(__dirname, 'curriculum', 'unit-index.json');
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const REQUEST_DELAY_MS = Number(process.env.TAG_DELAY_MS || 4500); // 무료 등급 RPM 제한 고려
const MAX_POSTS = process.env.MAX_POSTS ? Number(process.env.MAX_POSTS) : Infinity;
const CONTENT_CHAR_LIMIT = 1500; // 본문 HTML 제거 후 앞부분만 사용(비용/토큰 절약)

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
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

function loadUnitIndexText() {
  const units = JSON.parse(fs.readFileSync(UNIT_INDEX_PATH, 'utf8'));
  // 모델이 그대로 되돌려 쓰기 좋게 "연도|학교급|과목|단원명" 한 줄씩
  return units
    .map((u) => `${u.curriculumYear}|${u.schoolLevel}|${u.subject}|${u.unit}`)
    .join('\n');
}

function findAllPostFiles() {
  const files = [];
  for (const fldid of fs.readdirSync(DATA_DIR)) {
    const boardDir = path.join(DATA_DIR, fldid);
    if (!fs.statSync(boardDir).isDirectory()) continue;
    for (const f of fs.readdirSync(boardDir)) {
      if (f.endsWith('.json')) files.push(path.join(boardDir, f));
    }
  }
  return files;
}

const SYSTEM_INSTRUCTION = `너는 한국 중/고등학교 과학 교사 커뮤니티 게시글을 교육과정 단원에 매칭하는 분류기다.
아래는 "연도|학교급|과목|단원명" 형식의 전체 단원 목록이다(2015/2022 개정 교육과정 병존):

{{UNIT_INDEX}}

규칙:
- 게시글의 게시판명/제목/본문을 보고 위 목록에서 가장 관련성 높은 단원을 고른다. 개수 제한 없음 — 정말 여러 단원에 걸치면 그만큼 다 골라도 된다.
- 같은 주제가 2015판과 2022판 단원명으로 각각 존재하면, 굳이 하나만 고르지 말고 **둘 다** 태그해도 된다(교육과정 연도를 확신할 수 없는 게 일반적이므로).
- 특정 수업 단원과 관련이 없다고 판단되는 글(학급운영, 잡담, 행사/대회 안내, 자유게시판 글 등)은 아래처럼 "미분류"로 표시한다. 이때 curriculumYear/schoolLevel/subject는 모두 null로 둔다:
  {"tags":[{"curriculumYear":null,"schoolLevel":null,"subject":null,"unit":"미분류","confidence":"high"}], "note":"..."}
- 반드시 목록에 있는 연도/학교급/과목/단원명 표기를 정확히 그대로 사용한다(새로 만들지 않는다). "미분류"만 예외.
- 오직 JSON만 출력한다. 다른 설명 텍스트 금지.

출력 형식 예시(단원 매칭 시):
{"tags":[{"curriculumYear":"2015","schoolLevel":"중학교","subject":"과학","unit":"물질의 특성","confidence":"high"}], "note": ""}
confidence는 "high"|"medium"|"low" 중 하나. tags 배열이 비어있으면 안 된다 — 매칭 안 되면 반드시 "미분류" 항목을 넣을 것.`;

async function callGemini(unitIndexText, post) {
  const prompt = SYSTEM_INSTRUCTION.replace('{{UNIT_INDEX}}', unitIndexText);
  const userContent = `게시판: ${post.boardName || ''}
제목: ${post.title || ''}
글쓴이: ${post.author || ''}
본문(일부): ${stripHtml(post.contentHtml).slice(0, CONTENT_CHAR_LIMIT)}`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_API_KEY}`;
  const body = {
    contents: [{ role: 'user', parts: [{ text: userContent }] }],
    systemInstruction: { parts: [{ text: prompt }] },
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.1,
    },
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    const err = new Error(`Gemini API 오류 ${res.status}: ${text.slice(0, 300)}`);
    err.status = res.status;
    throw err;
  }

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Gemini 응답에서 텍스트를 찾을 수 없음: ' + JSON.stringify(data).slice(0, 300));

  return JSON.parse(text);
}

async function main() {
  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY 환경변수가 필요합니다.');
  }

  const unitIndexText = loadUnitIndexText();
  const files = findAllPostFiles();
  const untagged = files.filter((f) => {
    const post = JSON.parse(fs.readFileSync(f, 'utf8'));
    return !post.tags;
  });

  console.log(`전체 게시글 ${files.length}건 중 미태깅 ${untagged.length}건`);

  let done = 0;
  let failed = 0;
  const targets = untagged.slice(0, MAX_POSTS);

  // 429(한도 초과)면 60초 쉬고 딱 한 번만 재시도. 그래도 안 되면 하루/분당 한도로 보고 전체 중단.
  async function callWithRetry(post) {
    try {
      return await callGemini(unitIndexText, post);
    } catch (e) {
      if (e.status !== 429) throw e;
      console.log(`429(한도 초과) 감지. 60초 대기 후 재시도...`);
      await sleep(60000);
      return await callGemini(unitIndexText, post); // 여기서 또 429면 그대로 throw되어 아래에서 처리
    }
  }

  for (const file of targets) {
    const post = JSON.parse(fs.readFileSync(file, 'utf8'));
    try {
      const result = await callWithRetry(post);
      post.tags = result.tags || [];
      post.tagsNote = result.note || '';
      post.taggedAt = new Date().toISOString();
      fs.writeFileSync(file, JSON.stringify(post, null, 2));
      done += 1;
      const tagSummary = (post.tags || []).map((t) => `${t.schoolLevel}/${t.subject}/${t.unit}`).join(', ') || '(태그없음)';
      console.log(`[${done}/${targets.length}] ${post.title?.slice(0, 30)} -> ${tagSummary}`);
    } catch (e) {
      if (e.status === 429) {
        console.log('무료 등급 한도에 도달한 것으로 보입니다. 여기서 멈춥니다. 나중에 다시 node tag.js 실행하면 이어서 진행됩니다.');
        break;
      }
      failed += 1;
      console.error(`실패: ${file} - ${e.message}`);
    }
    await sleep(REQUEST_DELAY_MS);
  }

  console.log(`\n완료: ${done}건 태깅, ${failed}건 실패`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
