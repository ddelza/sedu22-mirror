// data/posts/**/*.json (태그 포함) + curriculum/*_ai.md(성취기준 문장)을 합쳐
// explore.html이 fetch()로 불러 쓸 수 있는 site-data/ 폴더(게시판별 JSON + manifest.json)를 생성한다.
// 태그 백필이 더 진행되면 이 스크립트만 다시 돌리면 됨(AI 호출 없음, 순수 파일 처리).
//
// 예전에는 전체 게시글을 site-data.js 한 파일(75MB+, 한 줄짜리)에 몰아넣었는데,
// 커밋할 때마다 git이 이 파일 전체를 거의 델타 압축 없이 새로 저장해서 저장소가 급격히
// 불어났다. 게시판별로 쪼개서 각 파일을 사람이 읽을 수 있게(줄바꿈 있게) 저장하면
// 실제로 바뀐 게시판만 diff가 발생해서 이 문제가 해결된다.
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const POSTS_DIR = path.join(ROOT, 'data', 'posts');
const CURRICULUM_DIR = path.join(ROOT, 'curriculum');
const SITE_DATA_DIR = path.join(ROOT, 'site-data');

// created "YY.MM.DD" 기준 최신순 정렬 (파싱 실패하면 맨 뒤로)
function sortKey(p) {
  const m = (p.created || '').match(/^(\d{2})\.(\d{2})\.(\d{2})/);
  if (!m) return '000000';
  return m[1] + m[2] + m[3];
}

// ---------- 1. 게시글 로드 (게시판별로 묶어서 반환) ----------
function loadPostsByBoard() {
  const byBoard = new Map(); // fldid -> { board, posts: [] }
  for (const fldid of fs.readdirSync(POSTS_DIR)) {
    const boardDir = path.join(POSTS_DIR, fldid);
    if (!fs.statSync(boardDir).isDirectory()) continue;
    for (const f of fs.readdirSync(boardDir)) {
      if (!f.endsWith('.json')) continue;
      const post = JSON.parse(fs.readFileSync(path.join(boardDir, f), 'utf8'));
      if (!byBoard.has(fldid)) byBoard.set(fldid, { board: post.boardName, posts: [] });
      byBoard.get(fldid).posts.push({
        id: `${post.fldid}-${post.dataid}`,
        fldid: post.fldid,
        board: post.boardName,
        title: post.title,
        author: post.author,
        created: post.created,
        viewCnt: post.viewCnt,
        commentCnt: post.commentCnt,
        permlink: post.permlink,
        contentHtml: post.contentHtml,
        tags: post.tags || null, // null = 아직 미태깅
      });
    }
  }
  for (const entry of byBoard.values()) {
    entry.posts.sort((a, b) => sortKey(b).localeCompare(sortKey(a)));
  }
  return byBoard;
}

// ---------- 2. 교육과정 트리 + 성취기준 문장 추출 ----------
// "## 가. 단원명" / "## (N) 단원명" / "#### (N) 단원명 (p..)" / "### (N) 단원명" 형태의 단원 헤더와
// "**[code]** 문장" / "- **[code]** 문장" / "### [code] 문장" 형태의 성취기준을 함께 스캔한다.
function extractStandards(text, unitHeaderRegexes) {
  const lines = text.split('\n');
  const result = {}; // unitName -> [sentence, ...]
  let currentUnit = null;

  for (const line of lines) {
    let matchedUnit = null;
    for (const re of unitHeaderRegexes) {
      const m = line.match(re);
      if (m) {
        matchedUnit = m[1].trim();
        break;
      }
    }
    if (matchedUnit) {
      currentUnit = matchedUnit;
      if (!result[currentUnit]) result[currentUnit] = [];
      continue;
    }
    if (!currentUnit) continue;

    // 성취기준 패턴 1: "- **[code]** 문장" 또는 "**[code]** 문장"
    let m = line.match(/\*\*\[([^\]]+)\]\*\*\s*(.+)/);
    // 성취기준 패턴 2 (ms2022): "### [code] 문장"
    if (!m) m = line.match(/^###\s*\[([^\]]+)\]\s*(.+)/);
    if (m) {
      const sentence = m[2].replace(/\s*〈탐구.*$/, '').trim();
      result[currentUnit].push(`[${m[1]}] ${sentence}`);
    }
  }
  return result;
}

function subjectFromMs() {
  return '과학';
}

function buildTree() {
  const tree = { '2015': { 중학교: {}, 고등학교: {} }, '2022': { 중학교: {}, 고등학교: {} } };

  // 중학교 단원들을 성취기준 코드 순번 구간별로 과학1/과학2/과학3(또는 중1/중2/과학3)으로 묶는다.
  // std 객체는 파싱 순서(=단원 순번 순서)를 그대로 유지하므로 인덱스로 잘라내면 됨.
  function splitIntoGroups(std, ranges) {
    const entries = Object.entries(std);
    const grouped = {};
    for (const [groupName, [from, to]] of Object.entries(ranges)) {
      grouped[groupName] = Object.fromEntries(entries.slice(from - 1, to));
    }
    return grouped;
  }

  // 2015 중학교: 단일 과목 "과학"(24단원), 단원 헤더 "## 가. 단원명"
  // -> 과학1(9과01~07) / 과학2(9과08~16) / 과학3(9과17~24)
  {
    const text = fs.readFileSync(path.join(CURRICULUM_DIR, '2015_ms_ai.md'), 'utf8');
    const std = extractStandards(text, [/^## [가-힣]\. (.+)$/]);
    Object.assign(tree['2015']['중학교'], splitIntoGroups(std, {
      '과학1': [1, 7],
      '과학2': [8, 16],
      '과학3': [17, 24],
    }));
  }

  // 2022 중학교: 단일 과목 "과학"(23단원), 단원 헤더 "## (N) 단원명" (성취기준은 "### [code] 문장")
  // -> 과학1(9과01~07) / 과학2(9과08~15) / 과학3(9과16~23)
  {
    const text = fs.readFileSync(path.join(CURRICULUM_DIR, '2022_ms_ai.md'), 'utf8');
    const std = extractStandards(text, [/^## \(\d+\) (.+)$/]);
    Object.assign(tree['2022']['중학교'], splitIntoGroups(std, {
      '과학1': [1, 7],
      '과학2': [8, 15],
      '과학3': [16, 23],
    }));
  }

  // 2015 고등학교: 과목별로 나뉨. "## 과목명 (pp..)" -> "#### (N) 단원명 (p..)"
  {
    const text = fs.readFileSync(path.join(CURRICULUM_DIR, '2015_hs_ai.md'), 'utf8');
    const lines = text.split('\n');
    let subject = null;
    let currentUnit = null;
    const bySubject = {};
    for (const line of lines) {
      const subjM = line.match(/^## ([가-힣A-Za-zⅠ]+)\s*\(pp?\.\d/);
      if (subjM) {
        subject = subjM[1];
        if (!bySubject[subject]) bySubject[subject] = {};
        currentUnit = null;
        continue;
      }
      if (!subject) continue;
      const unitM = line.match(/^#### \(\d+\) (.+?)(\s*—\s*성취수준)?\s*\(p/);
      if (unitM) {
        currentUnit = unitM[1].trim();
        if (!bySubject[subject][currentUnit]) bySubject[subject][currentUnit] = [];
        continue;
      }
      if (!currentUnit) continue;
      const m = line.match(/\*\*\[([^\]]+)\]\*\*\s*(.+)/);
      if (m) {
        const sentence = m[2].replace(/\s*〈탐구.*$/, '').trim();
        bySubject[subject][currentUnit].push(`[${m[1]}] ${sentence}`);
      }
    }
    tree['2015']['고등학교'] = bySubject;
  }

  // 2022 고등학교: "## 과목명" -> "### (N) 단원명"
  {
    const text = fs.readFileSync(path.join(CURRICULUM_DIR, '2022_hs_ai.md'), 'utf8');
    const lines = text.split('\n');
    let subject = null;
    let currentUnit = null;
    const bySubject = {};
    for (const line of lines) {
      const unitM = line.match(/^### \(\d+\) (.+)$/);
      const subjM = !unitM && line.match(/^## ([^\n(]+?)\s*$/);
      if (unitM && subject) {
        currentUnit = unitM[1].trim();
        if (!bySubject[subject][currentUnit]) bySubject[subject][currentUnit] = [];
        continue;
      }
      if (subjM) {
        subject = subjM[1].trim();
        if (!bySubject[subject]) bySubject[subject] = {};
        currentUnit = null;
        continue;
      }
      if (!currentUnit) continue;
      const m = line.match(/\*\*\[([^\]]+)\]\*\*\s*(.+)/);
      if (m) {
        const sentence = m[2].replace(/\s*〈탐구.*$/, '').trim();
        bySubject[subject][currentUnit].push(`[${m[1]}] ${sentence}`);
      }
    }
    tree['2022']['고등학교'] = bySubject;
  }

  return tree;
}

// ---------- 3. 조립 & 저장 (게시판별 JSON + manifest.json) ----------
const byBoard = loadPostsByBoard();
const tree = buildTree();

let totalPosts = 0, taggedCount = 0, unclassifiedCount = 0, totalBytes = 0;
const boards = [];

// 이전 실행에서 남은 게시판 파일이 있으면(게시판 삭제/fldid 변경 등) 정리하고 새로 쓴다.
fs.mkdirSync(SITE_DATA_DIR, { recursive: true });
for (const f of fs.readdirSync(SITE_DATA_DIR)) {
  if (f.endsWith('.json')) fs.unlinkSync(path.join(SITE_DATA_DIR, f));
}

for (const [fldid, { board, posts }] of [...byBoard.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
  totalPosts += posts.length;
  for (const p of posts) {
    if (p.tags && p.tags.length > 0) {
      taggedCount++;
      if (p.tags.some((t) => t.unit === '미분류')) unclassifiedCount++;
    }
  }
  // indent 2로 사람이 읽을 수 있게 저장 -> 다음에 태그 몇 개만 바뀌어도 git diff가 해당 줄만 잡아낸다.
  const json = JSON.stringify(posts, null, 2) + '\n';
  fs.writeFileSync(path.join(SITE_DATA_DIR, `${fldid}.json`), json);
  totalBytes += Buffer.byteLength(json);
  boards.push({ fldid, board, count: posts.length });
}

const manifest = { boards, tree, generatedAt: new Date().toISOString() };
const manifestJson = JSON.stringify(manifest, null, 2) + '\n';
fs.writeFileSync(path.join(SITE_DATA_DIR, 'manifest.json'), manifestJson);

// 예전 산출물(site-data.js)이 남아있으면 explore.html이 실수로 그걸 계속 읽는 일이 없도록 지운다.
const legacyPath = path.join(ROOT, 'site-data.js');
if (fs.existsSync(legacyPath)) fs.unlinkSync(legacyPath);

console.log(`게시글 ${totalPosts}건 (태그있음 ${taggedCount}건, 그중 미분류 ${unclassifiedCount}건), 게시판 ${boards.length}개`);
console.log(`site-data/ 생성 완료 (게시판 JSON 합계 ${(totalBytes / 1024 / 1024).toFixed(1)} MB + manifest.json)`);
