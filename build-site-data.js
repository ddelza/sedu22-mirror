// data/posts/**/*.json (태그 포함) + curriculum/*_ai.md(성취기준 문장)을 합쳐
// explore.html이 그대로 <script src>로 불러 쓸 수 있는 site-data.js를 생성한다.
// 태그 백필이 더 진행되면 이 스크립트만 다시 돌리면 됨(AI 호출 없음, 순수 파일 처리).
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const POSTS_DIR = path.join(ROOT, 'data', 'posts');
const CURRICULUM_DIR = path.join(ROOT, 'curriculum');

// ---------- 1. 게시글 로드 ----------
function loadPosts() {
  const posts = [];
  for (const fldid of fs.readdirSync(POSTS_DIR)) {
    const boardDir = path.join(POSTS_DIR, fldid);
    if (!fs.statSync(boardDir).isDirectory()) continue;
    for (const f of fs.readdirSync(boardDir)) {
      if (!f.endsWith('.json')) continue;
      const post = JSON.parse(fs.readFileSync(path.join(boardDir, f), 'utf8'));
      posts.push({
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
  // created "YY.MM.DD" 기준 최신순 정렬 (파싱 실패하면 맨 뒤로)
  function sortKey(p) {
    const m = (p.created || '').match(/^(\d{2})\.(\d{2})\.(\d{2})/);
    if (!m) return '000000';
    return m[1] + m[2] + m[3];
  }
  posts.sort((a, b) => sortKey(b).localeCompare(sortKey(a)));
  return posts;
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

  // 2015 중학교: 단일 과목 "과학", 단원 헤더 "## 가. 단원명"
  {
    const text = fs.readFileSync(path.join(CURRICULUM_DIR, '2015_ms_ai.md'), 'utf8');
    const std = extractStandards(text, [/^## [가-힣]\. (.+)$/]);
    tree['2015']['중학교']['과학'] = std;
  }

  // 2022 중학교: 단일 과목 "과학", 단원 헤더 "## (N) 단원명" (성취기준은 "### [code] 문장")
  {
    const text = fs.readFileSync(path.join(CURRICULUM_DIR, '2022_ms_ai.md'), 'utf8');
    const std = extractStandards(text, [/^## \(\d+\) (.+)$/]);
    tree['2022']['중학교']['과학'] = std;
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

// ---------- 3. 조립 & 저장 ----------
const posts = loadPosts();
const tree = buildTree();

const taggedCount = posts.filter((p) => p.tags && p.tags.length > 0).length;
const unclassifiedCount = posts.filter((p) => p.tags && p.tags.some((t) => t.unit === '미분류')).length;

const out = `window.SITE_DATA = ${JSON.stringify({ posts, tree }, null, 0)};\n`;
fs.writeFileSync(path.join(ROOT, 'site-data.js'), out);

console.log(`게시글 ${posts.length}건 (태그있음 ${taggedCount}건, 그중 미분류 ${unclassifiedCount}건)`);
console.log(`site-data.js 생성 완료 (${(out.length / 1024 / 1024).toFixed(1)} MB)`);
