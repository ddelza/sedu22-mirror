const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { request, chromium } = require('playwright');

const GRPID = '1TaBA';
const SESSION_PATH = process.env.SESSION_PATH || 'session.json';

// 세션의 단기 티켓(TSID 등, ~30분)이 만료돼도 장기 로그인 쿠키(_kau, TUID, UUID 등, ~1년)만
// 있으면 실제 브라우저로 홈 페이지를 한 번 방문하는 것만으로 자동 재인증되어 새 단기 티켓이
// 발급된다. 매 크롤링 실행 시작 시 이 과정을 거쳐 세션을 살려둔다.
async function refreshSession() {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ storageState: SESSION_PATH });
    const page = await context.newPage();
    await page.goto(`https://cafe.daum.net/sedu22`, { waitUntil: 'load' });
    await page.waitForTimeout(2000);
    const frame = page.frame({ name: 'down' });
    const loggedIn = frame
      ? await frame.evaluate(() => document.documentElement.innerHTML.includes('FavCafeList.login = "true"'))
      : false;
    if (!loggedIn) {
      throw new Error('세션 갱신 실패: 장기 로그인 쿠키가 만료된 것으로 보입니다. capture-session.js를 다시 실행해 재로그인이 필요합니다.');
    }
    const refreshed = await context.storageState();
    fs.writeFileSync(SESSION_PATH, JSON.stringify(refreshed, null, 2));
    console.log('세션 갱신 완료.');
  } finally {
    await browser.close();
  }
}
const DATA_DIR = path.join(__dirname, 'data');
const POSTS_DIR = path.join(DATA_DIR, 'posts');
const STATE_PATH = path.join(DATA_DIR, 'state.json');

// 테스트/백필 범위 제어용 (환경변수로 조정 가능)
const MAX_PAGES_PER_BOARD = Number(process.env.MAX_PAGES_PER_BOARD || 1);
const REQUEST_DELAY_MS = Number(process.env.REQUEST_DELAY_MS || 500);
const ONLY_FLDID = process.env.ONLY_FLDID || null; // 특정 게시판만 테스트하고 싶을 때

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function loadState() {
  if (fs.existsSync(STATE_PATH)) {
    return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
  }
  return {};
}

function saveState(state) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

// 좌측 메뉴에서 게시판 목록(fldid, 이름) 추출
function parseBoardList(menuHtml) {
  const boards = [];
  const re = /<a id="fldlink_([A-Za-z0-9_]+)_\d+" href="\/_c21_\/(bbs_list|memo_list)\?grpid=1TaBA&fldid=([A-Za-z0-9_]+)"[^>]*>([^<]+)<\/a>/g;
  let m;
  while ((m = re.exec(menuHtml))) {
    const [, fldidA, listType, fldidB, name] = m;
    if (listType !== 'bbs_list') continue; // memo_list(등업신청 등)는 제외
    boards.push({ fldid: fldidA, name: decodeHtmlEntities(name.trim()) });
  }
  return boards;
}

function decodeHtmlEntities(str) {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#160;/g, ' ');
}

// bbs_list HTML 안의 `var articles = []; articles.push({...})...` 블록을 안전하게 실행해서 배열로 추출
function parseArticleList(html) {
  const startMarker = 'var articles = [];';
  const startIdx = html.indexOf(startMarker);
  if (startIdx === -1) return { articles: [], lastPage: 1 };

  const endIdx = html.indexOf('var cafeRoles = [];', startIdx);
  const chunk = html.slice(startIdx, endIdx === -1 ? undefined : endIdx);

  const sandbox = { articles: [] };
  vm.createContext(sandbox);
  new vm.Script(chunk).runInContext(sandbox, { timeout: 5000 });

  const lastPageMatch = html.match(/lastPage:\s*'(\d+)'/);
  const lastPage = lastPageMatch ? Number(lastPageMatch[1]) : 1;

  return { articles: sandbox.articles, lastPage };
}

// bbs_read HTML에서 본문(xmp) + 메타데이터 추출
function parseArticle(html) {
  const xmpMatch = html.match(/<xmp id="template_xmp"[^>]*>([\s\S]*?)<\/xmp>/);
  const contentHtml = xmpMatch ? xmpMatch[1].trim() : null;

  const get = (key) => {
    const m = html.match(new RegExp(`${key}:\\s*'([^']*)'`));
    return m ? m[1] : null;
  };

  return {
    dataid: get('DATAID'),
    fldid: get('FLDID'),
    contentval: get('PARBBSDEPTH'),
    regdt: get('PLAIN_REGDT'),
    viewCnt: get('VIEWCOUNT'),
    permlink: get('permlink'),
    nickname: get('BBSNICKNAME'),
    contentHtml,
  };
}

async function fetchBoardArticles(ctx, fldid, seenIds) {
  const results = [];
  let page = 1;
  while (page <= MAX_PAGES_PER_BOARD) {
    const url = `https://cafe.daum.net/_c21_/bbs_list?grpid=${GRPID}&fldid=${fldid}&page=${page}`;
    const res = await ctx.get(url);
    const html = await res.text();
    const { articles, lastPage } = parseArticleList(html);
    results.push(...articles);

    // 목록이 최신순이므로, 한 페이지 전체가 이미 수집된 글이면 그 뒤는 볼 필요 없음
    // (증분 크롤링 효율화. 최초 백필 시엔 seenIds가 비어있어 끝까지 순회)
    const allSeen = articles.length > 0 && articles.every((a) => seenIds.has(a.dataid));
    if (allSeen) break;

    if (page >= lastPage) break;
    page += 1;
    await sleep(REQUEST_DELAY_MS);
  }
  return results;
}

async function fetchArticleContent(ctx, fldid, bbsdepth) {
  const url = `https://cafe.daum.net/_c21_/bbs_read?grpid=${GRPID}&fldid=${fldid}&contentval=${bbsdepth}`;
  const res = await ctx.get(url);
  const html = await res.text();
  return parseArticle(html);
}

// TSID 등 단기 세션 티켓 수명이 ~30분이라, 오래 걸리는 백필 도중에도
// 주기적으로 재인증해서 세션이 끊기지 않게 한다.
const SESSION_REFRESH_INTERVAL_MS = 20 * 60 * 1000;

async function main() {
  let ctx = null;
  let lastRefresh = 0;

  async function ensureFreshSession() {
    if (Date.now() - lastRefresh < SESSION_REFRESH_INTERVAL_MS && ctx) return;
    await refreshSession();
    if (ctx) await ctx.dispose();
    ctx = await request.newContext({ storageState: SESSION_PATH });
    lastRefresh = Date.now();
  }

  await ensureFreshSession();
  const state = loadState();

  const menuRes = await ctx.get(
    `https://cafe.daum.net/_c21_/bbs_menu_ajax?grpid=${GRPID}&ajax=true`
  );
  const menuHtml = await menuRes.text();
  let boards = parseBoardList(menuHtml);
  if (ONLY_FLDID) boards = boards.filter((b) => b.fldid === ONLY_FLDID);

  console.log(`게시판 ${boards.length}개 대상`);

  let totalNew = 0;

  for (const board of boards) {
    await ensureFreshSession();
    console.log(`\n[${board.name}] (${board.fldid}) 목록 조회 중...`);
    const seenIds = new Set(state[board.fldid]?.seenIds || []);
    const articles = await fetchBoardArticles(ctx, board.fldid, seenIds);
    const newArticles = articles.filter((a) => !seenIds.has(a.dataid));

    console.log(`  목록 ${articles.length}건 중 신규 ${newArticles.length}건`);

    const boardDir = path.join(POSTS_DIR, board.fldid);
    fs.mkdirSync(boardDir, { recursive: true });

    for (const a of newArticles) {
      const detail = await fetchArticleContent(ctx, board.fldid, a.bbsdepth);
      const record = {
        dataid: a.dataid,
        fldid: board.fldid,
        boardName: board.name,
        title: a.title,
        author: a.author,
        userid: a.userid,
        created: a.created,
        viewCnt: a.viewCnt,
        commentCnt: a.commentCnt,
        headCont: a.headCont,
        contentval: a.bbsdepth,
        permlink: detail.permlink,
        contentHtml: detail.contentHtml,
      };
      fs.writeFileSync(
        path.join(boardDir, `${a.dataid}.json`),
        JSON.stringify(record, null, 2)
      );
      seenIds.add(a.dataid);
      totalNew += 1;
      await sleep(REQUEST_DELAY_MS);
    }

    state[board.fldid] = { name: board.name, seenIds: [...seenIds] };
    saveState(state); // 게시판 단위로 저장 — 중간에 끊겨도 처음부터 다시 안 하도록
  }

  await ctx.dispose();

  console.log(`\n완료. 새로 저장된 게시글: ${totalNew}건`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
