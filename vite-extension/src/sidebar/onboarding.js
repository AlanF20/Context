/**
 * onboarding.js — first-visit explainer modal + persistent "?" reopen button.
 *
 * Uses the same native <dialog> pattern as modal.js (showModal()/close(),
 * the "close" event covers button/Escape/backdrop-click dismissal).
 */
import { createElement, CircleQuestionMark } from "lucide";
import { Store } from "./store.js";

const dialog = /** @type {HTMLDialogElement} */ (
  document.getElementById("onboarding-modal")
);
const closeBtn = dialog.querySelector(".onboarding-close");

/** Open the explainer modal, regardless of the "already seen" flag. */
export function openOnboarding() {
  dialog.showModal();
  closeBtn.focus();
}

/**
 * Wire the rail's "?" button and auto-show the modal on first visit.
 * @param {HTMLElement} helpBtnEl
 */
export async function initOnboarding(helpBtnEl) {
  const icon = createElement(CircleQuestionMark, { width: 16, height: 16 });
  icon.style.pointerEvents = "none";
  helpBtnEl.innerHTML = "";
  helpBtnEl.appendChild(icon);

  helpBtnEl.addEventListener("click", openOnboarding);
  closeBtn.addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", () => Store.markOnboardingSeen());
  // Backdrop click: a click landing on ::backdrop bubbles with the <dialog>
  // itself as target (no child element under the pointer), same trick used
  // for "click outside to dismiss" with native <dialog>.
  dialog.addEventListener("click", (e) => {
    if (e.target === dialog) dialog.close();
  });

  if (!(await Store.hasSeenOnboarding())) openOnboarding();
}
