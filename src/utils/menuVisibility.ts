/**
 * Show or hide the game UI panels (left panel, right panel, game stats).
 * Used by MainMenuScene (hide) and gameplay scenes (show).
 */
export function setGameUIVisibility(visible: boolean): void {
  const style = visible ? '' : 'none';
  const left = document.getElementById('left-panel');
  const right = document.getElementById('right-panel');
  const stats = document.getElementById('game-stats');
  if (left) (left as HTMLElement).style.display = style;
  if (right) (right as HTMLElement).style.display = style;
  if (stats) (stats as HTMLElement).style.display = style;
}
