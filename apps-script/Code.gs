/**
 * TABLERO OPERATIVO — TM BOXING
 * Backend en Google Apps Script (guarda todo en el Google Sheet del tablero).
 *
 * NOVEDADES de esta versión:
 *  1. TRASLADO AUTOMÁTICO: toda tarea pendiente de semanas anteriores se pasa
 *     sola a la semana actual (con contador de cuántas semanas viene arrastrada).
 *  2. MAIL DIARIO: cada persona recibe todos los días un mail con sus tareas
 *     pendientes de la semana. Configurá los mails en EMAILS y ejecutá una vez
 *     la función configurarDisparadorDiario().
 *
 * Instrucciones completas de instalación: ver README.md del repositorio.
 */

// ══ CONFIG ══════════════════════════════════════════════════════════════════

const SPREADSHEET_ID = '1RaUzLTlE1hZd86IwfSP7STBlVEtddz3R3JVWDrE3CWU';
const TZ = 'America/Argentina/Buenos_Aires';
const URL_TABLERO = 'https://agustinalvarezspj.github.io/tablero-tmboxing/';

// ⚠️ COMPLETAR: mail de cada persona. Si queda vacío (''), no se le envía nada.
const EMAILS = {
  agustin:  'agustinalvarezspj@gmail.com',
  franco:   '',
  tiago:    '',
  yamil:    '',
  catalina: '',
  lucia:    '',
  briana:   '',
  brianc:   '',
  martin:   '',
  juanma:   '',
  cintia:   '',
  tomasr:   '',
};

// Hora (0-23) a la que sale el mail diario. Cambiá el valor y volvé a ejecutar
// configurarDisparadorDiario() para aplicarlo.
const HORA_MAIL = 8;

const NOMBRES = {
  agustin: 'Agustín', franco: 'Franco', tiago: 'Tiago',
  yamil: 'Yamil', catalina: 'Catalina', lucia: 'Lucía',
  briana: 'Brian A', brianc: 'Brian C', martin: 'Martín',
  juanma: 'Juanma', cintia: 'Cintia', tomasr: 'Tomás R',
};
const AREAS_NOMBRE = {
  ventas: '💼 Ventas', clases: '🥊 Clases', tienda: '🛒 Tienda / Stock',
  limpieza: '🧹 Limpieza', mant: '🔧 Mantenimiento',
  marketing: '📣 Marketing', admin: '💰 Administración',
};
const PRIO_NOMBRE = { high: '🔴 Alta', med: '🟡 Media', low: '🟢 Baja' };

// Columnas de la hoja. Las primeras 12 ya existen; las últimas 3 se crean
// solas la primera vez que corre el script.
const HEADERS = ['id','title','area','person','priority','temp','dueDate','notes',
                 'done','doneBy','doneAt','weekKey','createdBy','createdAt','carried'];

// ══ API (la usa el tablero web) ═════════════════════════════════════════════

function doGet(e) {
  const p = (e && e.parameter) || {};
  const action = p.action || '';
  let out;
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    if (action === 'getTasks') {
      rolloverPendientes_();
      out = { tasks: getTasksByWeek_(String(p.weekKey || '')) };
    } else {
      const body = JSON.parse(p.data || '{}');
      if      (action === 'saveTask')   out = saveTask_(body.task);
      else if (action === 'toggleTask') out = toggleTask_(body);
      else if (action === 'deleteTask') out = deleteTask_(body.id);
      else if (action === 'addNote')    out = addNote_(body);
      else out = { error: 'Acción desconocida: ' + action };
    }
  } catch (err) {
    out = { error: String(err) };
  } finally {
    lock.releaseLock();
  }
  return ContentService.createTextOutput(JSON.stringify(out))
    .setMimeType(ContentService.MimeType.JSON);
}

// ══ HOJA ════════════════════════════════════════════════════════════════════

function getSheet_() {
  const sh = SpreadsheetApp.openById(SPREADSHEET_ID).getSheets()[0];
  ensureHeaders_(sh);
  return sh;
}

function ensureHeaders_(sh) {
  const lastCol = Math.max(sh.getLastColumn(), 1);
  const row = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(String);
  const missing = HEADERS.filter(h => row.indexOf(h) === -1);
  if (missing.length) {
    sh.getRange(1, lastCol + (row[0] ? 1 : 0), 1, missing.length).setValues([missing]);
  }
}

function headerIndex_(sh) {
  const row = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
  const idx = {};
  row.forEach((h, i) => { if (h) idx[h] = i; });
  return idx;
}

function esDone_(v) { return v === true || String(v).toUpperCase() === 'TRUE'; }

function rowToTask_(row, idx) {
  const t = {};
  Object.keys(idx).forEach(h => {
    let v = row[idx[h]];
    if (h === 'done') v = esDone_(v);
    else if (h === 'carried') v = Number(v) || 0;
    else if (v instanceof Date) {
      v = (h === 'dueDate') ? Utilities.formatDate(v, TZ, 'yyyy-MM-dd') : v.toISOString();
    } else {
      v = v === '' || v === null || v === undefined ? null : String(v);
    }
    t[h] = v;
  });
  return t;
}

function taskToRow_(task, idx, width, existingRow) {
  const row = existingRow ? existingRow.slice() : new Array(width).fill('');
  Object.keys(idx).forEach(h => {
    let v = task[h];
    if (v === undefined) return; // conserva lo que había (carried, createdAt, etc.)
    if (h === 'done') v = !!v;
    row[idx[h]] = (v === null) ? '' : v;
  });
  return row;
}

function getAllTasks_() {
  const sh = getSheet_();
  const data = sh.getDataRange().getValues();
  const idx = headerIndex_(sh);
  const tasks = [];
  for (let r = 1; r < data.length; r++) {
    if (String(data[r][idx.id] || '') === '') continue;
    tasks.push(rowToTask_(data[r], idx));
  }
  return tasks;
}

function getTasksByWeek_(weekKey) {
  return getAllTasks_().filter(t => t.weekKey === weekKey);
}

function findRowById_(sh, id) {
  const idx = headerIndex_(sh);
  const col = sh.getRange(2, idx.id + 1, Math.max(sh.getLastRow() - 1, 1), 1).getValues();
  for (let i = 0; i < col.length; i++) {
    if (String(col[i][0]) === String(id)) return i + 2; // fila real en la hoja
  }
  return -1;
}

// ══ ACCIONES ════════════════════════════════════════════════════════════════

function saveTask_(task) {
  if (!task || !task.id) return { error: 'Tarea inválida' };
  const sh = getSheet_();
  const idx = headerIndex_(sh);
  const width = sh.getLastColumn();
  const fila = findRowById_(sh, task.id);
  if (fila > 0) {
    const existing = sh.getRange(fila, 1, 1, width).getValues()[0];
    // Al editar, el front no manda carried/done reales: se preservan.
    delete task.done; delete task.doneBy; delete task.doneAt;
    delete task.carried; delete task.createdBy; delete task.createdAt;
    sh.getRange(fila, 1, 1, width).setValues([taskToRow_(task, idx, width, existing)]);
  } else {
    if (!task.carried) task.carried = 0;
    sh.appendRow(taskToRow_(task, idx, width, null));
  }
  return { ok: true };
}

function toggleTask_(body) {
  const sh = getSheet_();
  const idx = headerIndex_(sh);
  const fila = findRowById_(sh, body.id);
  if (fila < 0) return { error: 'No se encontró la tarea' };
  sh.getRange(fila, idx.done + 1).setValue(!!body.done);
  sh.getRange(fila, idx.doneBy + 1).setValue(body.doneBy || '');
  sh.getRange(fila, idx.doneAt + 1).setValue(body.doneAt || '');
  return { ok: true };
}

function deleteTask_(id) {
  const sh = getSheet_();
  const fila = findRowById_(sh, id);
  if (fila < 0) return { error: 'No se encontró la tarea' };
  sh.deleteRow(fila);
  return { ok: true };
}

function addNote_(body) {
  const sh = getSheet_();
  const idx = headerIndex_(sh);
  const fila = findRowById_(sh, body.id);
  if (fila < 0) return { error: 'No se encontró la tarea' };
  const cell = sh.getRange(fila, idx.notes + 1);
  const prev = String(cell.getValue() || '');
  cell.setValue((prev ? prev + ' | ' : '') + '[' + body.personName + ']: ' + body.note);
  return { ok: true };
}

// ══ TRASLADO AUTOMÁTICO DE PENDIENTES ═══════════════════════════════════════

function currentWeekKey_() {
  const now = new Date();
  const dow = Number(Utilities.formatDate(now, TZ, 'u')); // 1=lunes ... 7=domingo
  const monday = new Date(now.getTime() - (dow - 1) * 86400000);
  return 'week_' + Utilities.formatDate(monday, TZ, 'yyyy-MM-dd');
}

/**
 * Pasa a la semana actual toda tarea NO completada de semanas anteriores,
 * sumando en "carried" cuántas semanas viene arrastrada.
 * Corre sola cada vez que alguien abre el tablero y antes del mail diario.
 */
function rolloverPendientes_() {
  const sh = getSheet_();
  const idx = headerIndex_(sh);
  const data = sh.getDataRange().getValues();
  const cur = currentWeekKey_();
  const curDate = new Date(cur.slice(5) + 'T00:00:00Z');
  let movidas = 0;
  for (let r = 1; r < data.length; r++) {
    const wk = String(data[r][idx.weekKey] || '');
    if (!wk || wk.indexOf('week_') !== 0 || wk >= cur) continue;
    if (esDone_(data[r][idx.done])) continue;
    const wkDate = new Date(wk.slice(5) + 'T00:00:00Z');
    const semanas = Math.max(1, Math.round((curDate - wkDate) / (7 * 86400000)));
    sh.getRange(r + 1, idx.weekKey + 1).setValue(cur);
    sh.getRange(r + 1, idx.carried + 1).setValue((Number(data[r][idx.carried]) || 0) + semanas);
    movidas++;
  }
  return movidas;
}

// ══ MAIL DIARIO ═════════════════════════════════════════════════════════════

/**
 * Envía a cada persona (con mail configurado en EMAILS) sus tareas pendientes
 * de la semana actual. Ejecutar configurarDisparadorDiario() una vez para que
 * corra todos los días automáticamente.
 */
function enviarResumenDiario() {
  rolloverPendientes_();
  const cur = currentWeekKey_();
  const pendientes = getAllTasks_().filter(t => t.weekKey === cur && !t.done);
  const hoy = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
  const hoyLindo = Utilities.formatDate(new Date(), TZ, 'dd/MM');

  Object.keys(EMAILS).forEach(pid => {
    const email = EMAILS[pid];
    if (!email) return;
    const mias = pendientes.filter(t => t.person === pid)
      .sort((a, b) => {
        const o = { high: 0, med: 1, low: 2 };
        if (o[a.priority] !== o[b.priority]) return o[a.priority] - o[b.priority];
        return String(a.dueDate || '9999').localeCompare(String(b.dueDate || '9999'));
      });
    if (!mias.length) return;

    const filas = mias.map(t => {
      const vencida = t.dueDate && t.dueDate < hoy;
      const fecha = t.dueDate
        ? Utilities.formatDate(new Date(t.dueDate + 'T12:00:00'), TZ, 'dd/MM')
        : '—';
      return '<tr>' +
        '<td style="padding:8px 10px;border-bottom:1px solid #ece6d8;font-size:14px;color:#1c1917">' +
          escapeHtml_(t.title) +
          (t.carried > 0 ? ' <span style="background:#FDEBD0;color:#9A5B00;font-size:11px;padding:1px 7px;border-radius:9px">↪ arrastrada ' + (t.carried > 1 ? '×' + t.carried : '') + '</span>' : '') +
          (t.notes ? '<div style="font-size:12px;color:#7a6f60;margin-top:3px">📝 ' + escapeHtml_(t.notes) + '</div>' : '') +
        '</td>' +
        '<td style="padding:8px 10px;border-bottom:1px solid #ece6d8;font-size:12px;white-space:nowrap">' + (AREAS_NOMBRE[t.area] || t.area || '') + '</td>' +
        '<td style="padding:8px 10px;border-bottom:1px solid #ece6d8;font-size:12px;white-space:nowrap">' + (PRIO_NOMBRE[t.priority] || '') + '</td>' +
        '<td style="padding:8px 10px;border-bottom:1px solid #ece6d8;font-size:12px;white-space:nowrap;' + (vencida ? 'color:#c0392b;font-weight:bold' : 'color:#0C447C') + '">📅 ' + fecha + (vencida ? ' ¡vencida!' : '') + '</td>' +
      '</tr>';
    }).join('');

    const html =
      '<div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;background:#fefcf9;border:1px solid #ece6d8;border-radius:12px;overflow:hidden">' +
        '<div style="background:#141414;padding:18px 22px">' +
          '<div style="color:white;font-size:17px;font-weight:bold">🥊 TM Boxing — Tablero Operativo</div>' +
          '<div style="color:#FFE600;font-size:13px;margin-top:3px">Hola ' + (NOMBRES[pid] || pid) + ', estas son tus tareas pendientes de hoy ' + hoyLindo + '</div>' +
        '</div>' +
        '<table style="width:100%;border-collapse:collapse">' +
          '<tr style="background:#f6f2eb">' +
            '<th style="text-align:left;padding:8px 10px;font-size:11px;color:#7a6f60">TAREA</th>' +
            '<th style="text-align:left;padding:8px 10px;font-size:11px;color:#7a6f60">ÁREA</th>' +
            '<th style="text-align:left;padding:8px 10px;font-size:11px;color:#7a6f60">PRIORIDAD</th>' +
            '<th style="text-align:left;padding:8px 10px;font-size:11px;color:#7a6f60">LÍMITE</th>' +
          '</tr>' + filas +
        '</table>' +
        '<div style="padding:16px 22px;text-align:center">' +
          '<a href="' + URL_TABLERO + '" style="background:#141414;color:#FFE600;text-decoration:none;font-size:13px;padding:10px 22px;border-radius:8px;display:inline-block">Abrir el tablero</a>' +
        '</div>' +
      '</div>';

    MailApp.sendEmail({
      to: email,
      subject: '📋 Tus tareas de hoy (' + hoyLindo + ') — ' + mias.length + ' pendiente' + (mias.length === 1 ? '' : 's'),
      htmlBody: html,
    });
  });
}

function escapeHtml_(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ══ CONFIGURACIÓN (ejecutar a mano UNA vez) ═════════════════════════════════

/** Crea el disparador que envía el mail todos los días a la hora HORA_MAIL. */
function configurarDisparadorDiario() {
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === 'enviarResumenDiario') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('enviarResumenDiario').timeBased().everyDays(1).atHour(HORA_MAIL).create();
}

/** Para probar: envía el mail de hoy ahora mismo. */
function probarEmailAhora() {
  enviarResumenDiario();
}

/** Para probar: mueve los pendientes viejos a esta semana ahora mismo. */
function probarTrasladoAhora() {
  const n = rolloverPendientes_();
  Logger.log('Tareas trasladadas a la semana actual: ' + n);
}
