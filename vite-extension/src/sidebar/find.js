/**
 * find.js — floating find/replace bar for the Vista textarea editor.
 *
 * createFindBar() returns { mount, dispose, isOpen }.
 *
 * mount(containerEl, getTextarea, opts) appends the bar to containerEl
 * and wires keyboard + click events.  opts.onBeforeReplace is an async
 * callback that should push a history snapshot before any replace mutation.
 */

export function createFindBar() {
  let barEl = null;
  let taRef = null;
  let matches = [];
  let currentIdx = -1;
  let onBeforeReplace = null;

  function isOpen() {
    return barEl !== null;
  }

  function dispose() {
    if (barEl) { barEl.remove(); barEl = null; }
    matches = [];
    currentIdx = -1;
    taRef = null;
    onBeforeReplace = null;
  }

  function mount(containerEl, getTextarea, opts = {}) {
    if (barEl) {
      // Already open — just focus the search input.
      barEl.querySelector('.find-input')?.focus();
      return;
    }
    onBeforeReplace = opts.onBeforeReplace || null;
    taRef = getTextarea();

    barEl = document.createElement('div');
    barEl.className = 'find-bar';
    barEl.setAttribute('role', 'search');
    barEl.setAttribute('aria-label', 'Buscar y reemplazar');
    barEl.innerHTML =
      '<div class="find-row">' +
        '<input class="find-input" type="text" placeholder="Buscar…" autocomplete="off" spellcheck="false" />' +
        '<span class="find-count"></span>' +
        '<button class="icon-btn" data-fa="prev" title="Anterior (Shift+Enter)">‹</button>' +
        '<button class="icon-btn" data-fa="next" title="Siguiente (Enter)">›</button>' +
        '<button class="icon-btn" data-fa="toggle-replace" title="Reemplazar">±</button>' +
        '<button class="icon-btn" data-fa="close" title="Cerrar (Escape)">✕</button>' +
      '</div>' +
      '<div class="replace-row" hidden>' +
        '<input class="replace-input" type="text" placeholder="Reemplazar…" autocomplete="off" spellcheck="false" />' +
        '<button class="find-action-btn" data-fa="replace-one">Reemplazar</button>' +
        '<button class="find-action-btn" data-fa="replace-all">Todo</button>' +
      '</div>';

    containerEl.appendChild(barEl);

    const findInput    = barEl.querySelector('.find-input');
    const countEl      = barEl.querySelector('.find-count');
    const replaceRow   = barEl.querySelector('.replace-row');
    const replaceInput = barEl.querySelector('.replace-input');

    findInput.focus();

    findInput.addEventListener('input', () => runSearch(findInput.value, countEl));

    findInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        e.shiftKey ? goPrev(countEl) : goNext(countEl);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        closeAndReturn();
      }
    });

    replaceInput.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); closeAndReturn(); }
    });

    // Delegate button clicks via data-fa attribute.
    barEl.addEventListener('click', async (e) => {
      const action = e.target.closest('[data-fa]')?.dataset.fa;
      if (!action) return;
      if (action === 'prev')  goPrev(countEl);
      else if (action === 'next')  goNext(countEl);
      else if (action === 'close') closeAndReturn();
      else if (action === 'toggle-replace') {
        replaceRow.hidden = !replaceRow.hidden;
        if (!replaceRow.hidden) replaceInput.focus();
      }
      else if (action === 'replace-one') await doReplace(findInput.value, replaceInput.value, countEl);
      else if (action === 'replace-all') await doReplaceAll(findInput.value, replaceInput.value, countEl);
    });

    function closeAndReturn() {
      const ta = taRef;
      dispose();
      ta?.focus();
    }
  }

  // ---- Search helpers ----

  function escapeRegex(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function runSearch(query, countEl) {
    matches = [];
    currentIdx = -1;
    if (!query || !taRef) {
      if (countEl) countEl.textContent = '';
      return;
    }
    try {
      const re = new RegExp(escapeRegex(query), 'gi');
      matches = [...taRef.value.matchAll(re)];
    } catch (_) {
      matches = [];
    }
    if (matches.length) {
      currentIdx = 0;
      applySelection(0);
      if (countEl) countEl.textContent = `1 de ${matches.length}`;
    } else {
      if (countEl) countEl.textContent = '0 resultados';
    }
  }

  /** Set textarea selection range without stealing focus. */
  function applySelection(idx) {
    if (!taRef || idx < 0 || idx >= matches.length) return;
    const m = matches[idx];
    taRef.setSelectionRange(m.index, m.index + m[0].length);
    // Scroll the textarea so the match is roughly centred.
    const before = taRef.value.slice(0, m.index);
    const linesBefore = before.split('\n').length - 1;
    const lh = parseInt(window.getComputedStyle(taRef).lineHeight, 10) || 20;
    taRef.scrollTop = Math.max(0, (linesBefore - 3) * lh);
  }

  function goNext(countEl) {
    if (!matches.length) return;
    currentIdx = (currentIdx + 1) % matches.length;
    applySelection(currentIdx);
    if (countEl) countEl.textContent = `${currentIdx + 1} de ${matches.length}`;
  }

  function goPrev(countEl) {
    if (!matches.length) return;
    currentIdx = (currentIdx - 1 + matches.length) % matches.length;
    applySelection(currentIdx);
    if (countEl) countEl.textContent = `${currentIdx + 1} de ${matches.length}`;
  }

  // ---- Replace helpers ----

  async function doReplace(query, replacement, countEl) {
    if (!taRef || currentIdx < 0 || currentIdx >= matches.length) return;
    if (onBeforeReplace) await onBeforeReplace();
    const m = matches[currentIdx];
    const val = taRef.value;
    taRef.value = val.slice(0, m.index) + replacement + val.slice(m.index + m[0].length);
    taRef.dispatchEvent(new Event('input'));
    runSearch(query, countEl);
  }

  async function doReplaceAll(query, replacement, countEl) {
    if (!taRef || !query || !matches.length) return;
    if (onBeforeReplace) await onBeforeReplace();
    const re = new RegExp(escapeRegex(query), 'gi');
    taRef.value = taRef.value.replace(re, replacement);
    taRef.dispatchEvent(new Event('input'));
    runSearch(query, countEl);
  }

  return { mount, dispose, isOpen };
}
