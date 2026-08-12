// data/posts/**/*.json 전체를 훑어서 curriculum/unit-index.json에 실제로 없는
// (잘못 발명된) 단원명 태그를 올바른 단원명으로 고친다.
// 여러 세션에 걸쳐 태깅하며 존재하지 않는 단원명("힘과 운동", "태양계와 별" 등)을
// 만들어 쓴 것을 발견해서 한 번에 정리하는 일회성 스크립트.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..', '..', '..');
const POSTS_DIR = path.join(ROOT, 'data', 'posts');

// ---- 1. 모호하지 않은 1:1 전역 치환 (연도+학교급+기존단원명 -> 새 단원명) ----
const GLOBAL_RENAMES = [
  { curriculumYear: '2015', schoolLevel: '중학교', oldUnit: '물질의 세 가지 상태', newUnit: '물질의 상태 변화' },
  { curriculumYear: '2015', schoolLevel: '중학교', oldUnit: '화학 반응에서의 규칙성', newUnit: '화학 반응의 규칙과 에너지 변화' },
  { curriculumYear: '2015', schoolLevel: '고등학교', oldUnit: '화학 반응에서의 규칙성', newUnit: '역동적인 화학 반응' },
  { curriculumYear: '2015', schoolLevel: '고등학교', oldUnit: '원소의 주기성', newUnit: '원자의 세계' },
  { curriculumYear: '2015', schoolLevel: '고등학교', oldUnit: '화학 결합과 물질의 성질', newUnit: '화학 결합과 분자의 세계' },
  { curriculumYear: '2015', schoolLevel: '고등학교', oldUnit: '지구시스템', newUnit: '지구 시스템' },
  { curriculumYear: '2015', schoolLevel: '고등학교', oldUnit: '화학식량과 몰', newUnit: '화학의 첫걸음' },
  { curriculumYear: '2015', schoolLevel: '고등학교', oldUnit: '용액의 농도와 화학 반응식', newUnit: '역동적인 화학 반응' },
  { curriculumYear: '2015', schoolLevel: '고등학교', oldUnit: '우주의 시작과 원소의 생성', newUnit: '물질의 규칙성과 결합' },
  { curriculumYear: '2015', schoolLevel: '고등학교', oldUnit: '한반도의 지질과 지형', newUnit: '지권의 변동' },
  { curriculumYear: '2015', schoolLevel: '고등학교', oldUnit: '생식과 유전', newUnit: '유전' },
  { curriculumYear: '2015', schoolLevel: '고등학교', oldUnit: '지구의 형성과 변화', newUnit: '지권의 변동' },
  { curriculumYear: '2015', schoolLevel: '고등학교', oldUnit: '생명공학 기술과 인간생활', newUnit: '생명과학의 이해' },
  { curriculumYear: '2022', schoolLevel: '고등학교', oldUnit: '반응의 세계 산 염기 평형', newUnit: '산 염기 평형' },
  { curriculumYear: '2022', schoolLevel: '고등학교', oldUnit: '반응의 세계 산화·환원 반응', newUnit: '산화·환원 반응' },
  { curriculumYear: '2022', schoolLevel: '고등학교', oldUnit: '자유 탐구', newUnit: '과학 탐구의 과정과 절차' },
];

// ---- 2. 내용을 확인해서 개별 판단이 필요했던 것들 (파일 경로 기준) ----
// key: POSTS_DIR 기준 상대경로(슬래시), value: { oldUnit, newUnit, newSubject?, remove? }
const FILE_OVERRIDES = {
  // 과학기술의 유용성과 위험성 -> 개별 처리
  'f02N/460.json': { oldUnit: '과학기술의 유용성과 위험성', remove: true }, // 누리호 발사: 마땅한 단원 없음, 미분류로
  'F1n/762.json': { oldUnit: '과학기술의 유용성과 위험성', newUnit: '발전과 신재생 에너지', newSubject: '통합과학' }, // 적정기술

  // 시공간과 상대성 / 미시세계와 양자현상 / 별의 물리량과 스펙트럼 -> 개별 처리
  'f02N/467.json': { oldUnit: '시공간과 상대성', remove: true }, // 물리학Ⅰ 기말범위 질문, 2015 교육과정에 대응 단원 없음
  'F1n/719.json': { oldUnit: '미시세계와 양자현상', remove: true }, // 오펜하이머 영화: 특정 단원과 매칭 어려움
  'f02N/719.json': { oldUnit: '별의 물리량과 스펙트럼', newUnit: '별과 외계 행성계', newSchoolLevel: '고등학교', newSubject: '지구과학Ⅰ' }, // LED 분광기 관찰

  // 태양계와 별 (33건) -> 태양계 / 별과 우주로 분리
  'f02N/448.json': { oldUnit: '태양계와 별', newUnit: '별과 우주' },
  'f02N/578.json': { oldUnit: '태양계와 별', newUnit: '별과 우주' },
  'f02N/605.json': { oldUnit: '태양계와 별', newUnit: '별과 우주' },
  'f02N/633.json': { oldUnit: '태양계와 별', newUnit: '별과 우주' },
  'f02N/737.json': { oldUnit: '태양계와 별', newUnit: '태양계' },
  'f02N/789.json': { oldUnit: '태양계와 별', newUnit: '별과 우주' },
  'f02N/838.json': { oldUnit: '태양계와 별', newUnit: '별과 우주' },
  'f02N/842.json': { oldUnit: '태양계와 별', newUnit: '별과 우주' },
  'f02N/885.json': { oldUnit: '태양계와 별', newUnit: '별과 우주' },
  'f02N/890.json': { oldUnit: '태양계와 별', newUnit: '태양계' },
  'f02N/934.json': { oldUnit: '태양계와 별', newUnit: '태양계' },
  'f02N/985.json': { oldUnit: '태양계와 별', newUnit: '태양계' },
  'F1n/229.json': { oldUnit: '태양계와 별', newUnit: '별과 우주' },
  'F1n/664.json': { oldUnit: '태양계와 별', newUnit: '별과 우주' },
  'F1n/677.json': { oldUnit: '태양계와 별', newUnit: '별과 우주' },
  'F1n/726.json': { oldUnit: '태양계와 별', newUnit: '태양계' },
  'F1n/733.json': { oldUnit: '태양계와 별', newUnit: '태양계' },
  'F1n/777.json': { oldUnit: '태양계와 별', newUnit: '태양계' },
  'F1n/796.json': { oldUnit: '태양계와 별', newUnit: '별과 우주' },
  'F1n/812.json': { oldUnit: '태양계와 별', newUnit: '태양계' },
  'F1n/835.json': { oldUnit: '태양계와 별', newUnit: '별과 우주' },
  'F1n/854.json': { oldUnit: '태양계와 별', newUnit: '별과 우주' },
  'F1n/858.json': { oldUnit: '태양계와 별', newUnit: '태양계' },
  'F1n/867.json': { oldUnit: '태양계와 별', newUnit: '태양계' },
  'F1n/872.json': { oldUnit: '태양계와 별', newUnit: '태양계' },
  'F1n/881.json': { oldUnit: '태양계와 별', newUnit: '태양계' },
  'F1n/888.json': { oldUnit: '태양계와 별', newUnit: '별과 우주' },
  'F1n/889.json': { oldUnit: '태양계와 별', newUnit: '태양계' },
  'F1n/892.json': { oldUnit: '태양계와 별', newUnit: '태양계' },
  'F1n/910.json': { oldUnit: '태양계와 별', newUnit: '태양계' },
  'F1n/946.json': { oldUnit: '태양계와 별', newUnit: '별과 우주' },
  // F1n/673.json, F1n/895.json: 태양계+별과우주 둘 다 해당 -> addExtra로 별도 처리(아래)

  // 힘과 운동 (26건) -> 여러 가지 힘 / 운동과 에너지로 분리
  'f02N/35.json': { oldUnit: '힘과 운동', newUnit: '운동과 에너지' },
  'f02N/410.json': { oldUnit: '힘과 운동', newUnit: '여러 가지 힘' },
  'f02N/416.json': { oldUnit: '힘과 운동', newUnit: '여러 가지 힘' },
  'f02N/671.json': { oldUnit: '힘과 운동', newUnit: '여러 가지 힘' },
  'f02N/804.json': { oldUnit: '힘과 운동', newUnit: '운동과 에너지' },
  'f02N/837.json': { oldUnit: '힘과 운동', newUnit: '여러 가지 힘' },
  'F1n/10.json': { oldUnit: '힘과 운동', newUnit: '운동과 에너지' },
  'F1n/100.json': { oldUnit: '힘과 운동', newUnit: '여러 가지 힘' },
  'F1n/101.json': { oldUnit: '힘과 운동', newUnit: '여러 가지 힘' },
  'F1n/103.json': { oldUnit: '힘과 운동', newUnit: '여러 가지 힘' },
  'F1n/107.json': { oldUnit: '힘과 운동', newUnit: '운동과 에너지' },
  'F1n/113.json': { oldUnit: '힘과 운동', newUnit: '여러 가지 힘' },
  'F1n/360.json': { oldUnit: '힘과 운동', newUnit: '여러 가지 힘' },
  'F1n/361.json': { oldUnit: '힘과 운동', newUnit: '여러 가지 힘' },
  'F1n/365.json': { oldUnit: '힘과 운동', newUnit: '여러 가지 힘' },
  'F1n/370.json': { oldUnit: '힘과 운동', newUnit: '여러 가지 힘' },
  'F1n/371.json': { oldUnit: '힘과 운동', newUnit: '여러 가지 힘' },
  'F1n/374.json': { oldUnit: '힘과 운동', newUnit: '여러 가지 힘' },
  'F1n/376.json': { oldUnit: '힘과 운동', newUnit: '여러 가지 힘' },
  'F1n/383.json': { oldUnit: '힘과 운동', newUnit: '여러 가지 힘' },
  'F1n/520.json': { oldUnit: '힘과 운동', newUnit: '여러 가지 힘' },
  'F1n/584.json': { oldUnit: '힘과 운동', newUnit: '여러 가지 힘' },
  'F1n/885.json': { oldUnit: '힘과 운동', newUnit: '여러 가지 힘' },
  'F1n/894.json': { oldUnit: '힘과 운동', newUnit: '운동과 에너지' },
  'F1n/904.json': { oldUnit: '힘과 운동', newUnit: '여러 가지 힘' },
  'F1n/94.json': { oldUnit: '힘과 운동', newUnit: '운동과 에너지' },
};

// 한 파일에 태양계+별과우주 둘 다 태그를 추가해야 하는 경우(기존 잘못된 태그 하나를 올바른 태그
// 하나로 바꾸고, 두 번째 올바른 태그를 새로 추가한다).
const ADD_EXTRA_TAG = {
  'F1n/673.json': { curriculumYear: '2015', schoolLevel: '중학교', subject: '과학', unit: '태양계', confidence: 'medium' },
  'F1n/895.json': { curriculumYear: '2015', schoolLevel: '중학교', subject: '과학', unit: '별과 우주', confidence: 'high' },
};

let renamed = 0;
let overridden = 0;
let removed = 0;
let added = 0;

function normPath(fp) {
  return path.relative(POSTS_DIR, fp).split(path.sep).join('/');
}

for (const fldid of fs.readdirSync(POSTS_DIR)) {
  const boardDir = path.join(POSTS_DIR, fldid);
  if (!fs.statSync(boardDir).isDirectory()) continue;
  for (const f of fs.readdirSync(boardDir)) {
    if (!f.endsWith('.json')) continue;
    const filePath = path.join(boardDir, f);
    const rel = normPath(filePath);
    const post = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (!post.tags || !post.tags.length) continue;
    let changed = false;

    const override = FILE_OVERRIDES[rel];
    if (override) {
      const idx = post.tags.findIndex((t) => t.unit === override.oldUnit);
      if (idx !== -1) {
        if (override.remove) {
          post.tags.splice(idx, 1);
          if (!post.tags.some((t) => t.unit && t.unit !== '미분류') && !post.tags.some((t) => t.category && t.category !== '게시판별 분류')) {
            post.tags.push({ curriculumYear: null, schoolLevel: null, subject: null, unit: '미분류', confidence: 'low' });
          }
          removed++;
        } else {
          post.tags[idx].unit = override.newUnit;
          if (override.newSchoolLevel) post.tags[idx].schoolLevel = override.newSchoolLevel;
          if (override.newSubject) post.tags[idx].subject = override.newSubject;
          overridden++;
        }
        changed = true;
      }
    }

    const extra = ADD_EXTRA_TAG[rel];
    if (extra) {
      post.tags.push(extra);
      added++;
      changed = true;
    }

    for (const t of post.tags) {
      if (!t.unit) continue;
      const rule = GLOBAL_RENAMES.find((r) => r.curriculumYear === t.curriculumYear && r.schoolLevel === t.schoolLevel && r.oldUnit === t.unit);
      if (rule) {
        t.unit = rule.newUnit;
        renamed++;
        changed = true;
      }
    }

    if (changed) fs.writeFileSync(filePath, JSON.stringify(post, null, 2));
  }
}

console.log(`전역 치환: ${renamed}건, 개별 치환: ${overridden}건, 제거(미분류 처리): ${removed}건, 추가 태그: ${added}건`);
