// 원자료(curriculum/_raw/*.md)를 최종 8개 md 파일(AI용/사람용 x 4개 교육과정)로 조립하는 스크립트.
// 본문 내용은 건드리지 않고(전문 보존), 상단에 메타데이터/설명/목차만 붙이는 방식.
const fs = require('fs');
const path = require('path');

const RAW = path.join(__dirname, '_raw');
const OUT = __dirname;

function read(file) {
  return fs.readFileSync(path.join(RAW, file), 'utf8');
}

// heading 라인(## ~ ####)을 뽑아 목차를 만든다. 성취기준 코드로 시작하는 heading([9과.. 등)은
// 대단원이 아니라 개별 성취기준이라 목차에서는 제외한다(ms2022가 이 방식을 씀).
function extractToc(body) {
  const lines = body.split('\n');
  const toc = [];
  for (const line of lines) {
    const m = line.match(/^(#{2,4})\s+(.+)$/);
    if (!m) continue;
    const text = m[2].trim();
    if (text.startsWith('[')) continue; // 개별 성취기준 heading 제외
    if (text.includes('목차') || text.includes('전반부')) continue; // 파일 자체 메타 섹션 제외
    const depth = m[1].length - 2; // 0,1,2
    toc.push({ depth, text });
  }
  return toc;
}

function tocToMarkdown(toc) {
  return toc.map((item) => `${'  '.repeat(item.depth)}- ${item.text}`).join('\n');
}

const LEGEND = `## 성취수준 표기 안내

- **2015 개정**: 개별 성취기준마다 **상/중/하** 3단계 평가기준. 대단원 전체를 아우르는 **단원별 성취수준**은 보통 **A/B/C/D/E** 5단계(단, 과학탐구실험Ⅰ은 A/B/C 3단계).
- **2022 개정**: 개별 성취기준마다 **A~E** 5단계 성취기준별 성취수준(과목에 따라 3단계인 경우도 있음, 문서 내 명시). 대단원을 아우르는 **영역별 성취수준**은 지식·이해 / 과정·기능 / 가치·태도 세 범주로 나뉘어 각각 A~E로 기술됨.
- 성취기준 코드 형식: \`[학년군 과목약어 영역-순번]\` (예: \`[9과01-01]\` = 중학교 과학 1영역 1번, \`[10통과01-01]\` = 고1 통합과학 1단원 1번, \`[12물리01-01]\` = 고등 선택 물리학 1단원 1번).
- "예시 평가 도구/문항" 절은 분량이 매우 방대하여(원본 PDF 기준 수십~수백 페이지) 이 문서들에는 옮기지 않았습니다. 존재 여부와 대략적 페이지 범위만 원자료에 메모되어 있습니다.
`;

function buildDoc({ title, sourceNote, bodies, aiOut, humanOut }) {
  const combinedBody = bodies.join('\n\n---\n\n');
  const toc = extractToc(combinedBody);

  const aiHeader = `---
title: ${title}
purpose: sedu22-mirror 카페 게시글 자동 분류/태깅용 참고자료 (성취기준 코드로 게시글 주제를 매칭)
source_note: ${sourceNote}
level_scale: 2015=상/중/하(개별)+A~E(단원), 2022=A~E(개별, 일부 A~C)+A~E(영역, 지식이해/과정기능/가치태도)
generated_by: sedu22-mirror/curriculum/build.js (원자료 curriculum/_raw/*.md 를 가공)
---

${LEGEND}
---

`;

  const humanHeader = `# ${title}

이 문서는 [재과만(sedu22) 카페 미러 프로젝트](../README.md)에서 게시글을 교육과정 단원별로 분류·태깅하기 위해 만든 참고자료입니다. ${sourceNote}

${LEGEND}
## 목차

${tocToMarkdown(toc)}

---

`;

  fs.writeFileSync(path.join(OUT, aiOut), aiHeader + combinedBody + '\n');
  fs.writeFileSync(path.join(OUT, humanOut), humanHeader + combinedBody + '\n');
  console.log(`${title}: TOC ${toc.length}개 항목, 본문 ${combinedBody.length.toLocaleString()}자 -> ${aiOut} / ${humanOut}`);
}

// 1. 중학교 2015
buildDoc({
  title: '2015 개정 교육과정 — 중학교 과학 성취기준/평가기준',
  sourceNote: '원본: 2015 개정 교과 교육과정에 따른 평가기준(중학교 과학), 24개 단원(가~처) 전체.',
  bodies: [read('ms2015_content.md')],
  aiOut: '2015_ms_ai.md',
  humanOut: '2015_ms_human.md',
});

// 2. 고등학교 2015
buildDoc({
  title: '2015 개정 교육과정 — 고등학교 과학 성취기준/평가기준',
  sourceNote: '원본: 2015 개정 교육과정에 따른 평가기준(고등학교 과학과). 통합과학·과학탐구실험·물리학Ⅰ·화학Ⅰ·생명과학Ⅰ·지구과학Ⅰ 6개 과목. (물리학Ⅱ 등 심화 Ⅱ과목은 이 자료집에 없음)',
  bodies: [read('hs2015_content.md')],
  aiOut: '2015_hs_ai.md',
  humanOut: '2015_hs_human.md',
});

// 3. 중학교 2022
buildDoc({
  title: '2022 개정 교육과정 — 중학교 과학 성취수준',
  sourceNote: '원본: 2022 개정 교육과정에 따른 중학교 과학 성취수준, 23개 대단원 전체.',
  bodies: [read('ms2022_content.md')],
  aiOut: '2022_ms_ai.md',
  humanOut: '2022_ms_human.md',
});

// 4. 고등학교 2022 (공통과목 + 선택과목 병합)
buildDoc({
  title: '2022 개정 교육과정 — 고등학교 과학 성취수준 (공통+선택과목)',
  sourceNote: '원본 2개 문서 병합: ① 공통과목(통합과학1·2, 과학탐구실험1·2) ② 선택과목 15개(일반선택: 물리학·화학·생명과학·지구과학 / 진로선택: 역학과 에너지·전자기와 양자·물질과 에너지·화학 반응의 세계·세포와 물질대사·생물의 유전·지구시스템과학·행성우주과학 / 융합선택: 과학의 역사와 문화·기후변화와 환경생태·융합과학 탐구). 총 19개 과목.',
  bodies: [read('hs2022_content.md'), read('hs2022_elective_content.md')],
  aiOut: '2022_hs_ai.md',
  humanOut: '2022_hs_human.md',
});
