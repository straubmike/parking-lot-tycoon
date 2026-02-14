/**
 * ChallengeOverlays - Stateless DOM helpers for win/lose/time-up overlays.
 * Creates overlay elements and wires buttons to provided callbacks.
 * No game logic; scene owns remove-overlay + scene transition.
 */

const OVERLAY_ID = 'game-overlay';
const OVERLAY_STYLE =
  'position:absolute;inset:0;background:rgba(0,0,0,0.85);display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:100;color:#fff;font-family:sans-serif;';

function removeOverlay(): void {
  document.getElementById(OVERLAY_ID)?.remove();
}

/**
 * Show win overlay. Buttons call onMenu, onRetry, onLeaderboard.
 * Caller is responsible for removing overlay and performing transitions.
 */
export function showWinOverlay(
  container: HTMLElement,
  onMenu: () => void,
  onRetry: () => void,
  onLeaderboard: () => void
): void {
  if (document.getElementById(OVERLAY_ID)) return;
  const overlay = document.createElement('div');
  overlay.id = OVERLAY_ID;
  overlay.style.cssText = OVERLAY_STYLE;
  overlay.innerHTML = `
    <h2 style="margin-bottom:20px;font-size:28px;">Challenge Complete!</h2>
    <p style="margin-bottom:24px;">You've completed this challenge.</p>
    <div style="display:flex;gap:16px;">
      <button id="overlay-menu-btn" class="action-button" style="width:140px;">Menu</button>
      <button id="overlay-retry-btn" class="action-button" style="width:140px;">Retry</button>
      <button id="overlay-leaderboard-btn" class="action-button" style="width:140px;">Leaderboard</button>
    </div>
  `;
  container.appendChild(overlay);
  document.getElementById('overlay-menu-btn')?.addEventListener('click', () => {
    removeOverlay();
    onMenu();
  });
  document.getElementById('overlay-retry-btn')?.addEventListener('click', () => {
    removeOverlay();
    onRetry();
  });
  document.getElementById('overlay-leaderboard-btn')?.addEventListener('click', () => {
    removeOverlay();
    onLeaderboard();
  });
}

/**
 * Show lose overlay (ran out of money). Buttons call onMenu, onRetry.
 */
export function showLoseOverlay(
  container: HTMLElement,
  onMenu: () => void,
  onRetry: () => void
): void {
  if (document.getElementById(OVERLAY_ID)) return;
  const overlay = document.createElement('div');
  overlay.id = OVERLAY_ID;
  overlay.style.cssText = OVERLAY_STYLE;
  overlay.innerHTML = `
    <h2 style="margin-bottom:20px;font-size:28px;">Game Over</h2>
    <p style="margin-bottom:24px;">You ran out of money.</p>
    <div style="display:flex;gap:16px;">
      <button id="overlay-menu-btn" class="action-button" style="width:140px;">Menu</button>
      <button id="overlay-retry-btn" class="action-button" style="width:140px;">Retry</button>
    </div>
  `;
  container.appendChild(overlay);
  document.getElementById('overlay-menu-btn')?.addEventListener('click', () => {
    removeOverlay();
    onMenu();
  });
  document.getElementById('overlay-retry-btn')?.addEventListener('click', () => {
    removeOverlay();
    onRetry();
  });
}

/**
 * Show time-up overlay. maxDay is displayed in the message. Buttons call onMenu, onRetry.
 */
export function showTimeUpOverlay(
  container: HTMLElement,
  maxDay: number,
  onMenu: () => void,
  onRetry: () => void
): void {
  if (document.getElementById(OVERLAY_ID)) return;
  const overlay = document.createElement('div');
  overlay.id = OVERLAY_ID;
  overlay.style.cssText = OVERLAY_STYLE;
  overlay.innerHTML = `
    <h2 style="margin-bottom:20px;font-size:28px;">Time's Up</h2>
    <p style="margin-bottom:24px;">You didn't meet the win conditions by the end of day ${maxDay}.</p>
    <div style="display:flex;gap:16px;">
      <button id="overlay-menu-btn" class="action-button" style="width:140px;">Menu</button>
      <button id="overlay-retry-btn" class="action-button" style="width:140px;">Retry</button>
    </div>
  `;
  container.appendChild(overlay);
  document.getElementById('overlay-menu-btn')?.addEventListener('click', () => {
    removeOverlay();
    onMenu();
  });
  document.getElementById('overlay-retry-btn')?.addEventListener('click', () => {
    removeOverlay();
    onRetry();
  });
}
