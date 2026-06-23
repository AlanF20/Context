/**
 * popup.js — management popup
 * ---------------------------------------------------------------------------
 * Responsibilities:
 *   1. List all saved contexts with color, name, and note count.
 *   2. Let the user select a context to inspect its items.
 *   3. Create new contexts via a small inline form.
 *   4. Delete contexts (with browser confirm).
 *   5. Download the selected context as a plain-text (.txt) file.
 * ---------------------------------------------------------------------------
 */
import {
  listContexts,
  createContext,
  deleteContext,
  getContext,
  exportContextToText,
  CATEGORIES,
} from './storage.js';

// ---- state ----
let allContexts = [];
let activeId = null;

// ---- helpers ----
const $ = (sel, root = document) => root.querySelector(sel);

function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ---- download ----
function downloadTxt(ctx) {
  const text = exportContextToText(ctx);
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  // Sanitize filename: strip path-unsafe chars, keep spaces as hyphens.
  a.download = ctx.name.replace(/[/\\:*?"<>|]/g, '').trim().replace(/\s+/g, '-') + '.txt';
  a.href = url;
  a.click();
  URL.revokeObjectURL(url);
}

// ---- render context list ----
function renderContextList() {
  const list = $('#ctx-list');
  const empty = $('#empty-state');
  list.innerHTML = '';

  if (!allContexts.length) {
    empty.hidden = false;
    return;
  }
  empty.hidden = true;

  for (const ctx of allContexts) {
    const li = document.createElement('li');
    li.className = 'ch-ctx-item' + (ctx.id === activeId ? ' active' : '');
    li.dataset.id = ctx.id;

    const ctxBtn = document.createElement('button');
    ctxBtn.className = 'ch-ctx-btn';
    ctxBtn.type = 'button';
    ctxBtn.dataset.action = 'select';
    ctxBtn.dataset.id = ctx.id;
    ctxBtn.innerHTML =
      `<span class="ch-ctx-dot" style="background:${ctx.color}"></span>` +
      `<span class="ch-ctx-name">${escHtml(ctx.name)}</span>` +
      `<span class="ch-ctx-count">${ctx.items.length} nota${ctx.items.length !== 1 ? 's' : ''}</span>`;

    const actions = document.createElement('div');
    actions.className = 'ch-ctx-actions';

    const dlBtn = document.createElement('button');
    dlBtn.className = 'ch-icon-btn';
    dlBtn.type = 'button';
    dlBtn.title = 'Descargar .txt';
    dlBtn.textContent = '↓';
    dlBtn.dataset.action = 'download';
    dlBtn.dataset.id = ctx.id;

    const delBtn = document.createElement('button');
    delBtn.className = 'ch-icon-btn ch-icon-btn-danger';
    delBtn.type = 'button';
    delBtn.title = 'Eliminar contexto';
    delBtn.textContent = '×';
    delBtn.dataset.action = 'delete';
    delBtn.dataset.id = ctx.id;

    actions.append(dlBtn, delBtn);
    li.append(ctxBtn, actions);
    list.appendChild(li);
  }
}

// ---- render detail (items) ----
async function renderDetail(ctxId) {
  const ctx = await getContext(ctxId);
  if (!ctx) return;

  const SYMBOLS = { title: '§', idea: '◈', argument: '→', evidence: '✓' };

  $('#detail-title').textContent = ctx.name;

  const itemsList = $('#items-list');
  itemsList.innerHTML = '';

  if (!ctx.items.length) {
    const empty = document.createElement('li');
    empty.className = 'ch-items-empty';
    empty.textContent = 'Sin notas en este contexto.';
    itemsList.appendChild(empty);
  } else {
    for (const item of ctx.items) {
      const li = document.createElement('li');

      if (item.type === 'subtitle') {
        li.className = 'ch-item ch-item-subtitle';
        const h3 = document.createElement('h3');
        h3.textContent = item.text;
        li.appendChild(h3);
      } else {
        const catKey = item.category || '';
        li.className = `ch-item ch-item-text${catKey ? ` ch-item-${catKey}` : ''}`;

        const badge = document.createElement('span');
        badge.className = 'ch-badge';
        const cat = CATEGORIES[catKey];
        badge.textContent = cat
          ? `${SYMBOLS[catKey] ?? ''} ${cat.label}`
          : '· Nota';

        const p = document.createElement('p');
        p.textContent = item.text;

        li.append(badge, p);
      }

      itemsList.appendChild(li);
    }
  }

  // Wire download button in detail header to this context.
  $('#btn-download').onclick = () => downloadTxt(ctx);
  $('#detail').hidden = false;
}

// ---- event delegation on the context list ----
function onListClick(e) {
  const el = e.target.closest('[data-action]');
  if (!el) return;

  const { action, id } = el.dataset;

  if (action === 'download') {
    const ctx = allContexts.find((c) => c.id === id);
    if (ctx) downloadTxt(ctx);
    return;
  }

  if (action === 'delete') {
    const ctx = allContexts.find((c) => c.id === id);
    if (!ctx) return;
    if (!confirm(`¿Eliminar «${ctx.name}»? No se puede deshacer.`)) return;
    deleteContext(id).then(async () => {
      if (activeId === id) {
        activeId = null;
        $('#detail').hidden = true;
      }
      await refresh();
    });
    return;
  }

  if (action === 'select') {
    if (activeId === id) {
      // Toggle off.
      activeId = null;
      $('#detail').hidden = true;
      renderContextList();
    } else {
      activeId = id;
      renderContextList();
      renderDetail(id);
    }
  }
}

// ---- refresh ----
async function refresh() {
  allContexts = await listContexts();
  renderContextList();
  if (activeId) {
    const still = allContexts.find((c) => c.id === activeId);
    if (still) {
      await renderDetail(activeId);
    } else {
      activeId = null;
      $('#detail').hidden = true;
    }
  }
}

// ---- init ----
async function init() {
  const formNew = $('#form-new');

  $('#btn-new').addEventListener('click', () => {
    formNew.hidden = !formNew.hidden;
    if (!formNew.hidden) $('#input-name').focus();
  });

  formNew.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = $('#input-name').value.trim();
    if (!name) return;
    await createContext(name);
    $('#input-name').value = '';
    formNew.hidden = true;
    await refresh();
  });

  $('#btn-cancel-new').addEventListener('click', () => {
    formNew.hidden = true;
    $('#input-name').value = '';
  });

  // Single delegated listener on the list — added once, survives re-renders.
  $('#ctx-list').addEventListener('click', onListClick);

  await refresh();
}

document.addEventListener('DOMContentLoaded', init);
