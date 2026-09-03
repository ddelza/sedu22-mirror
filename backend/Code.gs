// sedu22-mirror 태그 제안(제안 게시판) + 관리자 모드 백엔드
//
// 배포 방법:
//   1. script.new 로 새 독립 실행형 Apps Script 프로젝트를 만든다.
//   2. 이 파일 내용을 통째로 붙여넣는다.
//   3. 배포 > 새 배포 > 유형: 웹 앱 / 실행 계정: 나 / 액세스 권한: 모든 사용자.
//   4. 처음 배포/실행 시 권한 승인 팝업이 뜨면 허용한다.
//   5. 배포된 /exec URL을 explore.html, admin.html의 APPS_SCRIPT_URL 상수에 붙여넣는다.
//
// 스프레드시트는 별도로 만들 필요 없다 — 첫 요청이 들어올 때 자동 생성되고
// 그 ID가 이 스크립트의 속성(ScriptProperties)에 저장된다.
//
// "🔄 큐 반영 실행" 버튼(admin.html)이 동작하려면 GITHUB_TOKEN을 스크립트 속성에 추가로
// 등록해야 한다: Apps Script 편집기 > 프로젝트 설정 > 스크립트 속성 > 속성 추가
//   이름: GITHUB_TOKEN / 값: ddelza/sedu22-mirror 저장소에 대해 최소 Actions:write
//   권한이 있는 GitHub 개인 액세스 토큰(classic PAT면 repo scope로 충분).
// 이 토큰은 GitHub Actions 워크플로(.github/workflows/apply-tag-feedback.yml)를 원격으로
// 실행시키는 데만 쓰이고, 실제 커밋/푸시는 그 워크플로 안에서 GitHub이 자동 발급하는
// 토큰으로 이뤄진다(이 토큰이 직접 커밋하지 않음).
//
// explore.html의 "🤖 이 자료로 수업 아이디어 물어보기"(공용 무료 한도 경로)가 동작하려면
// GEMINI_API_KEY를 스크립트 속성에 추가로 등록해야 한다: 위와 같은 스크립트 속성 화면에서
//   이름: GEMINI_API_KEY / 값: Google AI Studio에서 발급한 Gemini API 키
// 하루 사용량 한도는 AI_DAILY_LIMIT 스크립트 속성으로 조정 가능(안 넣으면 기본값 사용).

// 최초 1회만: Apps Script 편집기 상단 함수 드롭다운에서 authorizeExternalRequest를 골라
// 실행(▶)하면 "외부 서비스 연결 허용" 권한 승인 팝업이 뜬다 — 허용해야 triggerApply가 동작한다.
// (doGet/doPost는 인자(e) 없이 수동 실행하면 그 안에서 바로 에러가 나서 권한 요청까지
// 못 가므로 이 함수를 따로 둔다. 이름 끝에 _가 붙으면 Apps Script가 "비공개" 취급해서
// 실행 드롭다운에 아예 안 보이므로, 이 함수만 예외적으로 _ 없이 이름 붙임.)
function authorizeExternalRequest() {
  UrlFetchApp.fetch('https://api.github.com', { muteHttpExceptions: true });
}

const ADMIN_PASSWORD = 'sedu26ai';
const GITHUB_OWNER = 'ddelza';
const GITHUB_REPO = 'sedu22-mirror';
const GITHUB_WORKFLOW_FILE = 'apply-tag-feedback.yml';
const GEMINI_MODEL = 'gemini-3.5-flash-lite';
const AI_DAILY_LIMIT_DEFAULT = 200;
const SHEET_NAME_SUGGESTIONS = '제안';
const SHEET_NAME_ADMIN_EDITS = '관리자수정';
// addTags/removeTags: 기존 taxonomy(단원/카테고리-토픽)에서 체크박스로 고른 "정확한" 태그 객체 배열(JSON 문자열로 저장).
// newTagNote: 목록에 없어서 "새로운 태그 제안"으로 직접 입력한 자유 텍스트 — 이것만 사람/Claude 판단이 필요하다.
const FEEDBACK_HEADERS = ['timestamp', 'postId', 'postTitle', 'addTags', 'removeTags', 'newTagNote', 'note', 'status'];

function getSpreadsheet_() {
  const props = PropertiesService.getScriptProperties();
  let id = props.getProperty('SHEET_ID');
  let ss = null;
  if (id) {
    try { ss = SpreadsheetApp.openById(id); } catch (e) { ss = null; }
  }
  if (!ss) {
    ss = SpreadsheetApp.create('sedu22-tag-feedback');
    props.setProperty('SHEET_ID', ss.getId());
  }
  ensureSheet_(ss, SHEET_NAME_SUGGESTIONS);
  ensureSheet_(ss, SHEET_NAME_ADMIN_EDITS);
  const leftover = ss.getSheetByName('Sheet1') || ss.getSheetByName('시트1');
  if (leftover && ss.getSheets().length > 2) {
    try { ss.deleteSheet(leftover); } catch (e) { /* ignore */ }
  }
  return ss;
}

// 헤더 행을 매번 강제로 맞춰 쓴다 — 스키마가 바뀌어도(이번처럼) 기존 시트가 스스로 따라온다.
// 기존 데이터 행은 그대로 남지만, 이미 status=applied로 처리된 행이면 열이 밀려도 무해하다.
function ensureSheet_(ss, name) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  sheet.getRange(1, 1, 1, FEEDBACK_HEADERS.length).setValues([FEEDBACK_HEADERS]);
  sheet.setFrozenRows(1);
  return sheet;
}

function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    if (body.action === 'suggest') return handleSuggest_(body);
    if (body.action === 'adminEdit') return handleAdminEdit_(body);
    if (body.action === 'markApplied') return handleMarkApplied_(body);
    if (body.action === 'updateFeedback') return handleUpdateFeedback_(body);
    if (body.action === 'deleteFeedback') return handleDeleteFeedback_(body);
    if (body.action === 'triggerApply') return handleTriggerApply_(body);
    if (body.action === 'askLessonAI') return handleAskLessonAI_(body);
    return jsonOut_({ ok: false, error: 'unknown action: ' + body.action });
  } catch (err) {
    return jsonOut_({ ok: false, error: String(err) });
  }
}

function doGet(e) {
  try {
    const action = e.parameter.action;
    if (action === 'list') return handleList_(e.parameter.password);
    return jsonOut_({ ok: false, error: 'unknown action: ' + action });
  } catch (err) {
    return jsonOut_({ ok: false, error: String(err) });
  }
}

// 누구나 제출 가능 — 비밀번호 검증 없음.
// body: { postId, postTitle, addTags:[tagObj,...], removeTags:[tagObj,...], newTagNote, note }
function handleSuggest_(body) {
  appendFeedbackRow_(SHEET_NAME_SUGGESTIONS, body);
  return jsonOut_({ ok: true });
}

// 관리자만 — 비밀번호를 payload에 실어 보내고 서버에서 재검증한다.
function handleAdminEdit_(body) {
  if (body.password !== ADMIN_PASSWORD) return jsonOut_({ ok: false, error: 'bad password' });
  appendFeedbackRow_(SHEET_NAME_ADMIN_EDITS, body);
  return jsonOut_({ ok: true });
}

function appendFeedbackRow_(sheetName, body) {
  const ss = getSpreadsheet_();
  const sheet = ss.getSheetByName(sheetName);
  sheet.appendRow([
    new Date().toISOString(),
    body.postId || '',
    body.postTitle || '',
    JSON.stringify(body.addTags || []),
    JSON.stringify(body.removeTags || []),
    body.newTagNote || '',
    body.note || '',
    'pending',
  ]);
}

// 미처리(status=pending) 행만 반환. 제보자 정보가 섞여있을 수 있어 비밀번호로 보호한다.
function handleList_(password) {
  if (password !== ADMIN_PASSWORD) return jsonOut_({ ok: false, error: 'bad password' });
  const ss = getSpreadsheet_();
  const suggestions = readPending_(ss.getSheetByName(SHEET_NAME_SUGGESTIONS));
  const adminEdits = readPending_(ss.getSheetByName(SHEET_NAME_ADMIN_EDITS));
  return jsonOut_({ ok: true, suggestions, adminEdits });
}

function readPending_(sheet) {
  const values = sheet.getDataRange().getValues();
  const rows = [];
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    const obj = {};
    FEEDBACK_HEADERS.forEach((h, idx) => { obj[h] = row[idx]; });
    if (obj.status === 'pending') {
      obj._row = i + 1; // 1-based 시트 행 번호 (markApplied에서 사용)
      try { obj.addTags = JSON.parse(obj.addTags || '[]'); } catch (e) { obj.addTags = []; }
      try { obj.removeTags = JSON.parse(obj.removeTags || '[]'); } catch (e) { obj.removeTags = []; }
      rows.push(obj);
    }
  }
  return rows;
}

// 처리 완료된 행을 status=applied로 되돌려 표시. body: {password, sheet:'suggestions'|'adminEdits', rows:[행번호,...]}
function handleMarkApplied_(body) {
  if (body.password !== ADMIN_PASSWORD) return jsonOut_({ ok: false, error: 'bad password' });
  const sheet = feedbackSheet_(body.sheet);
  const statusCol = FEEDBACK_HEADERS.indexOf('status') + 1;
  (body.rows || []).forEach((r) => sheet.getRange(r, statusCol).setValue('applied'));
  return jsonOut_({ ok: true, updated: (body.rows || []).length });
}

// 관리자가 admin.html에서 대기 중인 요청의 태그 구성을 직접 고쳐서 덮어쓴다(상태는 pending 유지).
// body: {password, sheet, row, addTags, removeTags, newTagNote, note}
function handleUpdateFeedback_(body) {
  if (body.password !== ADMIN_PASSWORD) return jsonOut_({ ok: false, error: 'bad password' });
  const sheet = feedbackSheet_(body.sheet);
  const colOf = (name) => FEEDBACK_HEADERS.indexOf(name) + 1;
  sheet.getRange(body.row, colOf('addTags')).setValue(JSON.stringify(body.addTags || []));
  sheet.getRange(body.row, colOf('removeTags')).setValue(JSON.stringify(body.removeTags || []));
  sheet.getRange(body.row, colOf('newTagNote')).setValue(body.newTagNote || '');
  sheet.getRange(body.row, colOf('note')).setValue(body.note || '');
  return jsonOut_({ ok: true });
}

// 관리자가 대기 중인 요청을 거부/삭제. 실제 행은 지우지 않고 status=rejected로 표시해서
// 큐(list)에서는 빠지되 시트에 이력은 남는다. body: {password, sheet, row}
function handleDeleteFeedback_(body) {
  if (body.password !== ADMIN_PASSWORD) return jsonOut_({ ok: false, error: 'bad password' });
  const sheet = feedbackSheet_(body.sheet);
  const statusCol = FEEDBACK_HEADERS.indexOf('status') + 1;
  sheet.getRange(body.row, statusCol).setValue('rejected');
  return jsonOut_({ ok: true });
}

function feedbackSheet_(sheetParam) {
  const ss = getSpreadsheet_();
  return ss.getSheetByName(sheetParam === 'adminEdits' ? SHEET_NAME_ADMIN_EDITS : SHEET_NAME_SUGGESTIONS);
}

// admin.html의 "🔄 큐 반영 실행" 버튼 — GitHub Actions 워크플로(apply-tag-feedback.yml)를
// 원격으로 실행시킨다. 실제 큐 처리/커밋/푸시는 그 워크플로 안에서 이뤄지고, 여기서는
// 그냥 워크플로를 깨우기만 한다(비동기 — 결과를 기다리지 않고 바로 응답한다).
function handleTriggerApply_(body) {
  if (body.password !== ADMIN_PASSWORD) return jsonOut_({ ok: false, error: 'bad password' });
  const token = PropertiesService.getScriptProperties().getProperty('GITHUB_TOKEN');
  if (!token) return jsonOut_({ ok: false, error: 'GITHUB_TOKEN이 스크립트 속성에 설정되지 않았습니다.' });
  const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/workflows/${GITHUB_WORKFLOW_FILE}/dispatches`;
  const res = UrlFetchApp.fetch(url, {
    method: 'post',
    headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json' },
    contentType: 'application/json',
    payload: JSON.stringify({ ref: 'main' }),
    muteHttpExceptions: true,
  });
  const code = res.getResponseCode();
  if (code === 204) return jsonOut_({ ok: true });
  return jsonOut_({ ok: false, error: `GitHub API ${code}: ${res.getContentText()}` });
}

// explore.html 카트 화면의 "🤖 이 자료로 수업 아이디어 물어보기"(공용 무료 한도 경로).
// 비밀번호 없이 누구나 호출 가능 — 대신 하루 전체 사용량을 스크립트 속성으로 제한한다.
// body: { contents:[{role,parts:[{text}]},...], systemInstruction:{parts:[{text}]} }
// (클라이언트가 출처/대화 이력을 이미 Gemini API 형식 그대로 조립해서 보낸다 — 서버는
// 한도만 확인하고 그대로 중계한다.)
function handleAskLessonAI_(body) {
  const props = PropertiesService.getScriptProperties();
  const apiKey = props.getProperty('GEMINI_API_KEY');
  if (!apiKey) return jsonOut_({ ok: false, error: 'GEMINI_API_KEY가 스크립트 속성에 설정되지 않았습니다.' });

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const today = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd');
    const quotaKey = 'AI_QUOTA_' + today;
    const limit = Number(props.getProperty('AI_DAILY_LIMIT') || AI_DAILY_LIMIT_DEFAULT);
    const used = Number(props.getProperty(quotaKey) || 0);
    if (used >= limit) {
      return jsonOut_({ ok: false, quotaExceeded: true, error: '오늘 공용 무료 한도를 다 썼습니다.' });
    }
    props.setProperty(quotaKey, String(used + 1));
  } finally {
    lock.releaseLock();
  }

  return callGeminiFromServer_(apiKey, body.contents, body.systemInstruction);
}

function callGeminiFromServer_(apiKey, contents, systemInstruction) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const payload = { contents: contents, generationConfig: { maxOutputTokens: 2048 } };
  if (systemInstruction) payload.systemInstruction = systemInstruction;
  const res = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });
  const code = res.getResponseCode();
  const data = JSON.parse(res.getContentText());
  if (code !== 200) {
    return jsonOut_({ ok: false, error: (data.error && data.error.message) || `Gemini API ${code}` });
  }
  const candidate = data.candidates && data.candidates[0];
  const text = candidate ? (candidate.content.parts || []).map((p) => p.text || '').join('') : '';
  return jsonOut_({ ok: true, text: text });
}
