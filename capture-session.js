const { chromium } = require('playwright');

const CAFE_URL = 'https://cafe.daum.net/sedu22';
const GRPID = '1TaBA';
const MAX_WAIT_MS = 10 * 60 * 1000;
const POLL_MS = 3000;

async function isLoggedIn(page) {
  const frame = page.frames().find((f) => f.url().includes('/_c21_/home'));
  if (!frame) return false;
  const html = await frame.content().catch(() => '');
  return html.includes('FavCafeList.login = "true"');
}

(async () => {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto(CAFE_URL);
  console.log('브라우저 창에서 정회원 계정으로 로그인해주세요.');
  console.log('로그인이 완료되면 자동으로 감지해서 세션을 저장합니다. (최대 10분 대기)');

  const start = Date.now();
  let loggedIn = false;

  while (Date.now() - start < MAX_WAIT_MS) {
    if (await isLoggedIn(page)) {
      loggedIn = true;
      break;
    }
    await page.waitForTimeout(POLL_MS);
  }

  if (!loggedIn) {
    console.log('시간 초과: 로그인이 감지되지 않았습니다. 다시 실행해주세요.');
    await browser.close();
    process.exit(1);
  }

  console.log('로그인 확인됨. 세션 저장 중...');
  await context.storageState({ path: 'session.json' });
  console.log('session.json 저장 완료.');

  await browser.close();
  process.exit(0);
})();
