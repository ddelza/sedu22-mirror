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

const ADMIN_PASSWORD = 'sedu26ai';
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
