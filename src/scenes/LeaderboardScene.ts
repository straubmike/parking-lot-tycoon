import Phaser from 'phaser';
import { setGameUIVisibility } from '@/utils/menuVisibility';
import { LeaderboardSystem } from '@/systems/LeaderboardSystem';
import { CHALLENGE_ORDER } from '@/managers/ProgressManager';

const CHALLENGE_DISPLAY_NAMES_MAP: Record<string, string> = {
  'dev-mode': 'Dev Mode',
  'learning-lot': 'Learning Lot',
  'pizza-parking-problem': 'Pizza Parking Problem',
  'rush-hour-roundabout': 'Rush Hour Roundabout',
  'drive-in-disaster': 'Drive-In Disaster',
  'airport-arrivals': 'Airport Arrivals',
};

function getChallengeDisplayName(id: string): string {
  return CHALLENGE_DISPLAY_NAMES_MAP[id] ?? id;
}

export class LeaderboardScene extends Phaser.Scene {
  constructor() {
    super({ key: 'LeaderboardScene' });
  }

  create(): void {
    setGameUIVisibility(false);

    const leaderboard = LeaderboardSystem.getInstance();
    leaderboard.loadFromLocalStorage();

    const container = document.getElementById('app-container');
    if (!container) return;
    const existing = document.getElementById('leaderboard-panel');
    if (existing) existing.remove();

    const panel = document.createElement('div');
    panel.id = 'leaderboard-panel';
    panel.style.cssText = 'position:absolute;inset:0;background:#2a2a2a;display:flex;flex-direction:column;align-items:center;z-index:50;color:#fff;font-family:sans-serif;padding:40px;box-sizing:border-box;overflow:auto;';

    const title = document.createElement('h1');
    title.textContent = 'Leaderboard';
    title.style.marginBottom = '24px';
    title.style.fontSize = '32px';
    panel.appendChild(title);

    const filterLabel = document.createElement('label');
    filterLabel.textContent = 'Challenge: ';
    filterLabel.style.marginRight = '8px';
    const select = document.createElement('select');
    select.id = 'leaderboard-filter';
    select.style.cssText = 'padding:8px 12px;margin-bottom:20px;background:#3a3a3a;color:#fff;border:2px solid #555;border-radius:4px;font-size:14px;';
    const optionAll = document.createElement('option');
    optionAll.value = '';
    optionAll.textContent = 'All';
    select.appendChild(optionAll);
    for (const id of CHALLENGE_ORDER) {
      if (id === 'dev-mode') continue;
      const opt = document.createElement('option');
      opt.value = id;
      opt.textContent = getChallengeDisplayName(id);
      select.appendChild(opt);
    }
    const filterRow = document.createElement('div');
    filterRow.appendChild(filterLabel);
    filterRow.appendChild(select);
    panel.appendChild(filterRow);

    const status = document.createElement('div');
    status.id = 'leaderboard-status';
    status.style.cssText = 'color:#888;font-size:12px;margin-bottom:8px;min-height:16px;';
    panel.appendChild(status);

    const listDiv = document.createElement('div');
    listDiv.id = 'leaderboard-list';
    listDiv.style.cssText = 'width:100%;max-width:720px;margin-bottom:24px;';
    panel.appendChild(listDiv);

    const renderList = (challengeIdFilter: string) => {
      const entries = leaderboard.getEntries(challengeIdFilter || undefined);
      listDiv.innerHTML = '';
      if (entries.length === 0) {
        const empty = document.createElement('p');
        empty.textContent = 'No entries yet. Complete challenges to see scores here.';
        empty.style.color = '#888';
        listDiv.appendChild(empty);
        return;
      }
      listDiv.appendChild(buildLeaderboardTable(entries, getChallengeDisplayName));
    };

    renderList('');
    select.addEventListener('change', () => renderList(select.value));

    if (leaderboard.isRemoteEnabled()) {
      status.textContent = 'Loading global scores…';
      leaderboard.refreshFromRemote().then(() => {
        status.textContent = '';
        renderList(select.value);
      }).catch(() => {
        status.textContent = 'Showing local scores only (couldn\u2019t reach the server).';
      });
    } else {
      status.textContent = 'Showing local scores (no global leaderboard configured).';
    }

    const backBtn = document.createElement('button');
    backBtn.textContent = 'Back to menu';
    backBtn.className = 'action-button';
    backBtn.style.cssText = 'padding:12px 24px;font-size:16px;cursor:pointer;background:#3a3a3a;color:#fff;border:2px solid #555;border-radius:4px;';
    backBtn.addEventListener('click', () => {
      panel.remove();
      setGameUIVisibility(true);
      this.scene.start('MainMenuScene');
    });
    panel.appendChild(backBtn);

    container.appendChild(panel);
  }

  shutdown(): void {
    document.getElementById('leaderboard-panel')?.remove();
    setGameUIVisibility(true);
  }
}

/**
 * Render the top-N table: rank, player, challenge, rating, profit, day.
 * Shared between the dedicated LeaderboardScene and the main-menu tab.
 */
export function buildLeaderboardTable(
  entries: import('@/systems/LeaderboardSystem').LeaderboardEntry[],
  getDisplayName: (id: string) => string,
): HTMLElement {
  const table = document.createElement('table');
  table.style.cssText = 'width:100%;border-collapse:collapse;font-size:14px;color:#fff;';
  const headCellBase = 'padding:8px;border-bottom:1px solid #555;';
  table.innerHTML =
    '<thead><tr>' +
    `<th style="text-align:left;${headCellBase}">#</th>` +
    `<th style="text-align:left;${headCellBase}">Player</th>` +
    `<th style="text-align:left;${headCellBase}">Challenge</th>` +
    `<th style="text-align:right;${headCellBase}">Rating</th>` +
    `<th style="text-align:right;${headCellBase}">Profit</th>` +
    `<th style="text-align:right;${headCellBase}">Day</th>` +
    '</tr></thead><tbody></tbody>';
  const tbody = table.querySelector('tbody')!;
  const cellStyle = 'padding:8px;border-bottom:1px solid #333;';
  const rightCellStyle = cellStyle + 'text-align:right;';
  entries.forEach((e, i) => {
    const row = document.createElement('tr');
    const cells: Array<{ text: string; style: string }> = [
      { text: String(i + 1), style: cellStyle },
      { text: e.playerName, style: cellStyle },
      { text: getDisplayName(e.challengeId), style: cellStyle },
      { text: String(e.rating), style: rightCellStyle },
      { text: `$${e.profit.toLocaleString()}`, style: rightCellStyle },
      { text: String(e.completionDay), style: rightCellStyle },
    ];
    for (const { text, style } of cells) {
      const td = document.createElement('td');
      td.style.cssText = style;
      td.textContent = text;
      row.appendChild(td);
    }
    tbody.appendChild(row);
  });
  return table;
}
