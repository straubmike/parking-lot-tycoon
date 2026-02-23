import Phaser from 'phaser';
import {
  CHALLENGE_ORDER,
  isChallengeUnlocked,
  isChallengeCompleted,
} from '@/managers/ProgressManager';
import { setGameUIVisibility } from '@/utils/menuVisibility';
import { getChallengeById, getChallengesInOrder } from '@/config/challenges.config';
import { LeaderboardSystem } from '@/systems/LeaderboardSystem';
import { Challenge } from '@/types';
import aboutText from '../../about.txt?raw';

const CHALLENGE_DISPLAY_NAMES: Record<string, string> = {
  'dev-mode': 'Dev Mode',
  'learning-lot': 'Learning Lot',
  'pizza-parking-problem': 'Pizza Parking Problem',
  'rush-hour-roundabout': 'Rush Hour Roundabout',
  'drive-in-disaster': 'Drive-In Disaster',
  'airport-arrivals': 'Airport Arrivals',
};

function getChallengeDisplayName(id: string): string {
  return CHALLENGE_DISPLAY_NAMES[id] ?? id;
}

export class MainMenuScene extends Phaser.Scene {
  private menuOverlay: HTMLElement | null = null;

  constructor() {
    super({ key: 'MainMenuScene' });
  }

  create(): void {
    setGameUIVisibility(false);
    this.buildMenuDOM();
  }

  private buildMenuDOM(): void {
    const container = document.getElementById('app-container');
    if (!container) return;
    const existing = document.getElementById('main-menu-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'main-menu-overlay';
    this.menuOverlay = overlay;

    // Title banner
    const title = document.createElement('div');
    title.className = 'main-menu-title';
    title.textContent = 'Parking Lot Tycoon';
    overlay.appendChild(title);

    // Tab bar
    const tabs = document.createElement('div');
    tabs.className = 'main-menu-tabs';
    const playTab = document.createElement('button');
    playTab.className = 'main-menu-tab active';
    playTab.textContent = 'Play';
    playTab.type = 'button';
    const leaderboardTab = document.createElement('button');
    leaderboardTab.className = 'main-menu-tab';
    leaderboardTab.textContent = 'Leaderboard';
    leaderboardTab.type = 'button';
    const aboutTab = document.createElement('button');
    aboutTab.className = 'main-menu-tab';
    aboutTab.textContent = 'About';
    aboutTab.type = 'button';
    tabs.appendChild(playTab);
    tabs.appendChild(leaderboardTab);
    tabs.appendChild(aboutTab);
    overlay.appendChild(tabs);

    // Body: two panels
    const body = document.createElement('div');
    body.className = 'main-menu-body';

    const playPanel = document.createElement('div');
    playPanel.id = 'play-tab-panel';
    playPanel.className = 'tab-panel active';
    playPanel.appendChild(this.buildPlayCardsGrid());
    body.appendChild(playPanel);

    const leaderboardPanel = document.createElement('div');
    leaderboardPanel.id = 'leaderboard-tab-panel';
    leaderboardPanel.className = 'tab-panel';
    leaderboardPanel.appendChild(this.buildLeaderboardTabContent());
    body.appendChild(leaderboardPanel);

    const aboutPanel = document.createElement('div');
    aboutPanel.id = 'about-tab-panel';
    aboutPanel.className = 'tab-panel';
    aboutPanel.appendChild(this.buildAboutContent());
    body.appendChild(aboutPanel);

    overlay.appendChild(body);

    const allTabs = [playTab, leaderboardTab, aboutTab];
    const allPanels = [playPanel, leaderboardPanel, aboutPanel];
    const activateTab = (index: number) => {
      allTabs.forEach((t, i) => t.classList.toggle('active', i === index));
      allPanels.forEach((p, i) => p.classList.toggle('active', i === index));
    };
    playTab.addEventListener('click', () => activateTab(0));
    leaderboardTab.addEventListener('click', () => activateTab(1));
    aboutTab.addEventListener('click', () => activateTab(2));

    container.appendChild(overlay);
  }

  private buildPlayCardsGrid(): HTMLElement {
    const grid = document.createElement('div');
    grid.className = 'play-cards-grid';

    const challengesInOrder = getChallengesInOrder();
    for (const challenge of challengesInOrder) {
      const card = this.buildChallengeCard(challenge);
      grid.appendChild(card);
    }

    return grid;
  }

  private buildChallengeCard(challenge: Challenge): HTMLElement {
    // Dev Mode is always unlocked so it can be used for testing in any environment
    const unlocked = challenge.id === 'dev-mode' || isChallengeUnlocked(challenge.id);
    const completed = isChallengeCompleted(challenge.id);

    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'challenge-card';
    if (!unlocked) card.classList.add('locked');
    if (completed) card.classList.add('completed');

    const title = document.createElement('div');
    title.className = 'challenge-card-title';
    title.textContent = challenge.name;
    card.appendChild(title);

    const description = document.createElement('div');
    description.className = 'challenge-card-description';
    description.textContent = challenge.description;
    card.appendChild(description);

    if (challenge.descriptionSubline) {
      const subline = document.createElement('div');
      subline.className = 'challenge-card-playable-grid';
      subline.textContent = challenge.descriptionSubline;
      card.appendChild(subline);
    }

    const budget = document.createElement('div');
    budget.className = 'challenge-card-budget';
    budget.textContent = `Starting budget: $${challenge.budget.toLocaleString()}`;
    card.appendChild(budget);

    if (challenge.winConditions.length > 0) {
      const conditions = document.createElement('div');
      conditions.className = 'challenge-card-conditions';
      const maxDay = challenge.maxDay ?? 5;
      conditions.textContent = `Win conditions by the end of day ${maxDay}:`;
      const ul = document.createElement('ul');
      for (const wc of challenge.winConditions) {
        const li = document.createElement('li');
        li.textContent = wc.description;
        ul.appendChild(li);
      }
      conditions.appendChild(ul);
      card.appendChild(conditions);
    }

    if (!unlocked) {
      const badge = document.createElement('span');
      badge.className = 'challenge-card-badge locked';
      badge.textContent = 'Locked';
      card.appendChild(badge);
    } else if (completed) {
      const badge = document.createElement('span');
      badge.className = 'challenge-card-badge completed';
      badge.textContent = 'Completed';
      card.appendChild(badge);
    }

    if (unlocked) {
      card.addEventListener('click', () => this.startChallenge(challenge.id));
    }

    return card;
  }

  private buildLeaderboardTabContent(): HTMLElement {
    const wrap = document.createElement('div');
    wrap.id = 'leaderboard-tab-content';

    const leaderboard = LeaderboardSystem.getInstance();
    leaderboard.loadFromLocalStorage();

    const title = document.createElement('h2');
    title.style.cssText = 'color:#fff;margin:0 0 16px 0;font-size:20px;';
    title.textContent = 'Leaderboard';
    wrap.appendChild(title);

    const select = document.createElement('select');
    select.style.cssText = 'padding:8px 12px;margin-bottom:16px;background:#3a3a3a;color:#fff;border:2px solid #555;border-radius:4px;font-size:14px;width:100%;max-width:280px;';
    const optionAll = document.createElement('option');
    optionAll.value = '';
    optionAll.textContent = 'All challenges';
    select.appendChild(optionAll);
    for (const id of CHALLENGE_ORDER) {
      if (id === 'dev-mode') continue;
      const opt = document.createElement('option');
      opt.value = id;
      opt.textContent = getChallengeDisplayName(id);
      select.appendChild(opt);
    }
    wrap.appendChild(select);

    const listDiv = document.createElement('div');
    listDiv.id = 'menu-leaderboard-list';

    const renderList = (challengeIdFilter: string) => {
      const entries = challengeIdFilter ? leaderboard.getEntries(challengeIdFilter) : leaderboard.getEntries();
      listDiv.innerHTML = '';
      if (entries.length === 0) {
        const empty = document.createElement('p');
        empty.style.color = '#888';
        empty.textContent = 'No entries yet. Complete challenges to see scores here.';
        listDiv.appendChild(empty);
        return;
      }
      const table = document.createElement('table');
      table.style.cssText = 'width:100%;border-collapse:collapse;font-size:14px;color:#fff;';
      table.innerHTML = '<thead><tr><th style="text-align:left;padding:8px;border-bottom:1px solid #555;">#</th><th style="text-align:left;padding:8px;border-bottom:1px solid #555;">Player</th><th style="text-align:left;padding:8px;border-bottom:1px solid #555;">Challenge</th><th style="text-align:right;padding:8px;border-bottom:1px solid #555;">Score</th><th style="text-align:right;padding:8px;border-bottom:1px solid #555;">Profit</th></tr></thead><tbody></tbody>';
      const tbody = table.querySelector('tbody')!;
      entries.forEach((e, i) => {
        const row = document.createElement('tr');
        row.innerHTML = `
          <td style="padding:8px;border-bottom:1px solid #333;">${i + 1}</td>
          <td style="padding:8px;border-bottom:1px solid #333;">${e.playerName}</td>
          <td style="padding:8px;border-bottom:1px solid #333;">${getChallengeDisplayName(e.challengeId)}</td>
          <td style="padding:8px;border-bottom:1px solid #333;text-align:right;">${e.score}</td>
          <td style="padding:8px;border-bottom:1px solid #333;text-align:right;">$${e.metrics.profit.toLocaleString()}</td>
        `;
        tbody.appendChild(row);
      });
      listDiv.appendChild(table);
    };

    renderList('');
    select.addEventListener('change', () => renderList(select.value));
    wrap.appendChild(listDiv);

    return wrap;
  }

  private buildAboutContent(): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'about-panel';

    const linkPattern = /<a\s+href="([^"]*)"[^>]*>(.*?)<\/a>/gi;
    const paragraphs = aboutText.split('\n\n');
    for (const para of paragraphs) {
      const trimmed = para.trim();
      if (!trimmed) continue;
      const p = document.createElement('p');
      p.className = 'about-paragraph';

      let lastIndex = 0;
      let match: RegExpExecArray | null;
      linkPattern.lastIndex = 0;
      while ((match = linkPattern.exec(trimmed)) !== null) {
        if (match.index > lastIndex) {
          p.appendChild(document.createTextNode(trimmed.slice(lastIndex, match.index)));
        }
        const a = document.createElement('a');
        a.href = match[1];
        a.textContent = match[2];
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.className = 'about-link';
        p.appendChild(a);
        lastIndex = linkPattern.lastIndex;
      }
      if (lastIndex < trimmed.length) {
        p.appendChild(document.createTextNode(trimmed.slice(lastIndex)));
      }

      wrap.appendChild(p);
    }

    return wrap;
  }

  private startChallenge(challengeId: string): void {
    setGameUIVisibility(true);
    // Remove menu overlay immediately so the game canvas is visible (don't rely on shutdown order)
    document.getElementById('main-menu-overlay')?.remove();
    this.menuOverlay = null;
    const isDevMode = challengeId === 'dev-mode';
    if (isDevMode) {
      this.scene.start('DevModeScene', { challengeId: 'dev-mode', isDevMode: true, gridWidth: 10, gridHeight: 10 });
    } else {
      const challenge = getChallengeById(challengeId);
      const gridWidth = challenge?.lotSize?.width ?? 10;
      const gridHeight = challenge?.lotSize?.height ?? 10;
      this.scene.start('ChallengeScene', { challengeId, gridWidth, gridHeight });
    }
  }

  shutdown(): void {
    document.getElementById('main-menu-overlay')?.remove();
    this.menuOverlay = null;
    setGameUIVisibility(true);
  }
}
