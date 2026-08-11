// 4개 최종 md 파일에서 "학교급/교육과정연도/과목/단원명"만 뽑아 가벼운 인덱스(JSON)를 만든다.
// AI 태깅 시 전체 md(수백 KB) 대신 이 인덱스(수 KB)만 프롬프트에 넣어 후보를 좁히는 데 쓴다.
const fs = require('fs');
const path = require('path');

const DIR = __dirname;
const units = [];

function add(curriculumYear, schoolLevel, subject, unit) {
  units.push({ curriculumYear, schoolLevel, subject, unit: unit.trim() });
}

// 2015 중학교: ## 가. 단원명  (단일 과목 "과학")
function parseMs2015() {
  const body = fs.readFileSync(path.join(DIR, '2015_ms_ai.md'), 'utf8');
  const re = /^## ([가-힣]\. .+)$/gm;
  let m;
  while ((m = re.exec(body))) {
    add('2015', '중학교', '과학', m[1].replace(/^[가-힣]\.\s*/, ''));
  }
}

// 2022 중학교: ## (N) 단원명  (단일 과목 "과학"), ### [code] 는 제외
// "영역별 성취수준" 섹션이 같은 헤더 패턴을 재사용해 단원명이 중복 등장하므로 이름 기준으로 dedupe.
function parseMs2022() {
  const body = fs.readFileSync(path.join(DIR, '2022_ms_ai.md'), 'utf8');
  const re = /^## \(\d+\) (.+)$/gm;
  const seen = new Set();
  let m;
  while ((m = re.exec(body))) {
    const name = m[1].trim();
    if (seen.has(name)) continue;
    seen.add(name);
    add('2022', '중학교', '과학', name);
  }
}

// 2015 고등학교: ## 과목명 (pp..)  ->  #### (N) 단원명 (p..)  [— 성취수준 붙은 중복은 스킵]
function parseHs2015() {
  const body = fs.readFileSync(path.join(DIR, '2015_hs_ai.md'), 'utf8');
  const lines = body.split('\n');
  let subject = null;
  const seen = new Set();
  for (const line of lines) {
    const subjM = line.match(/^## ([가-힣A-Za-z가-힣Ⅰ]+)\s*\(pp?\.\d/);
    if (subjM) {
      subject = subjM[1];
      seen.clear();
      continue;
    }
    const unitM = line.match(/^#### \(\d+\) (.+?)(\s*—\s*성취수준)?\s*\(p/);
    if (unitM && subject) {
      const name = unitM[1].trim();
      const key = subject + '::' + name;
      if (!seen.has(key)) {
        seen.add(key);
        add('2015', '고등학교', subject, name);
      }
    }
  }
}

// 2022 고등학교: ## 과목명  ->  ### (N) 단원명
function parseHs2022() {
  const body = fs.readFileSync(path.join(DIR, '2022_hs_ai.md'), 'utf8');
  const lines = body.split('\n');
  let subject = null;
  for (const line of lines) {
    const subjM = line.match(/^## ([^\n(]+?)\s*$/);
    const unitM = line.match(/^### \(\d+\) (.+)$/);
    if (unitM && subject) {
      add('2022', '고등학교', subject, unitM[1].trim());
    } else if (subjM && !line.startsWith('###')) {
      subject = subjM[1].trim();
    }
  }
}

parseMs2015();
parseMs2022();
parseHs2015();
parseHs2022();

fs.writeFileSync(path.join(DIR, 'unit-index.json'), JSON.stringify(units, null, 2));

// 확인용 요약 출력
const bySubject = {};
for (const u of units) {
  const key = `${u.curriculumYear} ${u.schoolLevel} ${u.subject}`;
  bySubject[key] = (bySubject[key] || 0) + 1;
}
console.log(`총 ${units.length}개 단원 -> unit-index.json`);
for (const [k, v] of Object.entries(bySubject)) console.log(`  ${k}: ${v}개`);
