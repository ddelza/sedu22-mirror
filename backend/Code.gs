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
const SUGGESTION_HEADERS = ['timestamp', 'postId', 'postTitle', 'suggestionType', 'note', 'status'];
const ADMIN_EDIT_HEADERS = ['timestamp', 'postId', 'postTitle', 'editAction', 'tagPayload', 'note', 'status'];

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
  ensureSheet_(ss, SHEET_NAME_SUGGESTIONS, SUGGESTION_HEADERS);
  ensureSheet_(ss, SHEET_NAME_ADMIN_EDITS, ADMIN_EDIT_HEADERS);
  const leftover = ss.getSheetByName('Sheet1') || ss.getSheetByName('시트1');
  if (leftover && ss.getSheets().length > 2) {
    try { ss.deleteSheet(leftover); } catch (e) { /* ignore */ }
  }
  return ss;
}

function ensureSheet_(ss, name, headers) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.appendRow(headers);
    sheet.setFrozenRows(1);
  }
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
function handleSuggest_(body) {
  const ss = getSpreadsheet_();
  const sheet = ss.getSheetByName(SHEET_NAME_SUGGESTIONS);
  sheet.appendRow([
    new Date().toISOString(),
    body.postId || '',
    body.postTitle || '',
    body.suggestionType || '',
    body.note || '',
    'pending',
  ]);
  return jsonOut_({ ok: true });
}

// 관리자만 — 비밀번호를 payload에 실어 보내고 서버에서 재검증한다.
function handleAdminEdit_(body) {
  if (body.password !== ADMIN_PASSWORD) return jsonOut_({ ok: false, error: 'bad password' });
  const ss = getSpreadsheet_();
  const sheet = ss.getSheetByName(SHEET_NAME_ADMIN_EDITS);
  sheet.appendRow([
    new Date().toISOString(),
    body.postId || '',
    body.postTitle || '',
    body.editAction || '',
    JSON.stringify(body.tagPayload || {}),
    body.note || '',
    'pending',
  ]);
  return jsonOut_({ ok: true });
}

// 미처리(status=pending) 행만 반환. 제보자 정보가 섞여있을 수 있어 비밀번호로 보호한다.
function handleList_(password) {
  if (password !== ADMIN_PASSWORD) return jsonOut_({ ok: false, error: 'bad password' });
  const ss = getSpreadsheet_();
  const suggestions = readPending_(ss.getSheetByName(SHEET_NAME_SUGGESTIONS), SUGGESTION_HEADERS);
  const adminEdits = readPending_(ss.getSheetByName(SHEET_NAME_ADMIN_EDITS), ADMIN_EDIT_HEADERS);
  return jsonOut_({ ok: true, suggestions, adminEdits });
}

function readPending_(sheet, headers) {
  const values = sheet.getDataRange().getValues();
  const rows = [];
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    const obj = {};
    headers.forEach((h, idx) => { obj[h] = row[idx]; });
    if (obj.status === 'pending') {
      obj._row = i + 1; // 1-based 시트 행 번호 (markApplied에서 사용)
      rows.push(obj);
    }
  }
  return rows;
}

// 처리 완료된 행을 status=applied로 되돌려 표시. body: {password, sheet:'suggestions'|'adminEdits', rows:[행번호,...]}
function handleMarkApplied_(body) {
  if (body.password !== ADMIN_PASSWORD) return jsonOut_({ ok: false, error: 'bad password' });
  const ss = getSpreadsheet_();
  const isAdminEdits = body.sheet === 'adminEdits';
  const sheet = ss.getSheetByName(isAdminEdits ? SHEET_NAME_ADMIN_EDITS : SHEET_NAME_SUGGESTIONS);
  const headers = isAdminEdits ? ADMIN_EDIT_HEADERS : SUGGESTION_HEADERS;
  const statusCol = headers.indexOf('status') + 1;
  (body.rows || []).forEach((r) => sheet.getRange(r, statusCol).setValue('applied'));
  return jsonOut_({ ok: true, updated: (body.rows || []).length });
}
