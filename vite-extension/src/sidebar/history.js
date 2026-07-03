/**
 * history.js — in-memory undo/redo stack per context.
 *
 * Snapshots are JSON strings of { name, items }. The stack is ephemeral:
 * it lives only as long as the sidebar page is open.
 */

const MAX = 50;

export function createHistoryManager() {
  const stacks = {};

  function get(id) {
    if (!stacks[id]) stacks[id] = { past: [], future: [] };
    return stacks[id];
  }

  /** Push a snapshot before a write. Clears redo branch. */
  function push(id, snapshot) {
    const s = get(id);
    s.past.push(snapshot);
    if (s.past.length > MAX) s.past.shift();
    s.future = [];
  }

  /**
   * Undo: pop past, push currentSnapshot to future.
   * Returns the snapshot to restore, or null if stack is empty.
   */
  function undo(id, currentSnapshot) {
    const s = get(id);
    if (!s.past.length) return null;
    s.future.push(currentSnapshot);
    if (s.future.length > MAX) s.future.shift();
    return s.past.pop();
  }

  /**
   * Redo: pop future, push currentSnapshot to past.
   * Returns the snapshot to restore, or null if stack is empty.
   */
  function redo(id, currentSnapshot) {
    const s = get(id);
    if (!s.future.length) return null;
    s.past.push(currentSnapshot);
    if (s.past.length > MAX) s.past.shift();
    return s.future.pop();
  }

  /** Drop history for a context (called on deleteContext). */
  function invalidate(id) {
    delete stacks[id];
  }

  return { push, undo, redo, invalidate };
}
