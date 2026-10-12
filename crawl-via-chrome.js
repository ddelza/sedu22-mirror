// 로그인된 크롬 탭(cafe.daum.net)이 브리지 역할을 하며 요청을 대신 보내는 크롤링.
// 사용법: node crawl-via-chrome.js 실행 후, 크롬의 카페 탭에서 브리지 스크립트를 주입한다.
const http = require('http');
const { main } = require('./crawler');

const PORT = Number(process.env.BRIDGE_PORT || 39217);
const ORIGIN = 'https://cafe.daum.net';
const JOB_TIMEOUT_MS = 120000;

const queue = [];
const pending = new Map();
let nextId = 1;

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', ORIGIN);
  res.setHeader('Access-Control-Allow-Private-Network', 'true');
  res.setHeader('Access-Control-Allow-Headers', 'content-type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
}

const server = http.createServer((req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }
  const u = new URL(req.url, `http://127.0.0.1:${PORT}`);
  if (u.pathname === '/job') {
    const job = queue.shift();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(job ? { id: job.id, url: job.url } : { wait: true }));
  }
  if (u.pathname === '/result' && req.method === 'POST') {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      try {
        const { id, status, text } = JSON.parse(body);
        const p = pending.get(id);
        if (p) {
          pending.delete(id);
          clearTimeout(p.timer);
          p.resolve({ status, text });
        }
      } catch (e) {
        console.error('결과 파싱 오류', e.message);
      }
      res.writeHead(200);
      res.end('ok');
    });
    return;
  }
  res.writeHead(404);
  res.end();
});

const bridgeCtx = {
  get(url) {
    return new Promise((resolve, reject) => {
      const id = nextId++;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`브리지 응답 시간 초과: ${url}`));
      }, JOB_TIMEOUT_MS);
      pending.set(id, {
        timer,
        resolve: ({ status, text }) => {
          if (status <= 0) return reject(new Error(`네트워크 오류: ${url} ${text}`));
          resolve({ text: async () => text });
        },
      });
      queue.push({ id, url });
    });
  },
  dispose: async () => {},
};

server.listen(PORT, '127.0.0.1', () => {
  console.log(`브리지 서버 대기 중: http://127.0.0.1:${PORT} (크롬 탭에서 브리지를 시작해주세요)`);
  main({ ctx: bridgeCtx })
    .then(() => process.exit(0))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
});
