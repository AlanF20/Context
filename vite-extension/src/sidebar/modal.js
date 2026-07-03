/**
 * modal.js — confirmation dialog for destructive actions.
 */

const dialog = /** @type {HTMLDialogElement} */ (
  document.getElementById("confirm-delete-modal")
);
const ctxNameEl = dialog.querySelector(".modal-ctx-name");
const cancelBtn = dialog.querySelector(".modal-cancel");
const confirmBtn = dialog.querySelector(".modal-confirm");

/**
 * Show a "¿Eliminar «ctxName»?" dialog.
 * @param {string} ctxName  display name of the context to delete
 * @returns {Promise<boolean>} true = confirmed, false = cancelled
 */
export function confirmDelete(ctxName) {
  ctxNameEl.textContent = `«${ctxName}»`;

  return new Promise((resolve) => {
    function cleanup() {
      cancelBtn.removeEventListener("click", onCancel);
      confirmBtn.removeEventListener("click", onConfirm);
      dialog.removeEventListener("close", onClose);
    }

    function onCancel() {
      cleanup();
      dialog.close();
      resolve(false);
    }

    function onConfirm() {
      cleanup();
      dialog.close();
      resolve(true);
    }

    // Fires on Escape key (native <dialog> behavior) or programmatic .close().
    function onClose() {
      cleanup();
      resolve(false);
    }

    cancelBtn.addEventListener("click", onCancel, { once: true });
    confirmBtn.addEventListener("click", onConfirm, { once: true });
    dialog.addEventListener("close", onClose, { once: true });

    dialog.showModal();
    cancelBtn.focus();
  });
}
