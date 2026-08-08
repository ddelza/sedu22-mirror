const fs = require('fs');
const path = require('path');

const POSTS_DIR = path.join(__dirname, 'data', 'posts');
const OUT_PATH = path.join(__dirname, 'viewer-data.js');

const posts = [];

if (fs.existsSync(POSTS_DIR)) {
  for (const fldid of fs.readdirSync(POSTS_DIR)) {
    const boardDir = path.join(POSTS_DIR, fldid);
    if (!fs.statSync(boardDir).isDirectory()) continue;
    for (const file of fs.readdirSync(boardDir)) {
      if (!file.endsWith('.json')) continue;
      try {
        const record = JSON.parse(fs.readFileSync(path.join(boardDir, file), 'utf8'));
        posts.push(record);
      } catch (e) {
        console.warn('파싱 실패, 건너뜀:', file, e.message);
      }
    }
  }
}

posts.sort((a, b) => Number(b.dataid) - Number(a.dataid));

fs.writeFileSync(OUT_PATH, 'window.POSTS = ' + JSON.stringify(posts) + ';\n');
console.log(`총 ${posts.length}건 -> ${OUT_PATH}`);
