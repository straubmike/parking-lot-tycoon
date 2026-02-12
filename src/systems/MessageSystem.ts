import { TimeSystem } from './TimeSystem';

/**
 * Message types for categorization
 */
export type MessageType = 'parker_reaction' | 'tutorial' | 'system' | 'achievement';

/**
 * A game message with timestamp and metadata
 */
export interface GameMessage {
  id: string;
  type: MessageType;
  parkerName?: string;
  text: string;
  emoji: string;
  timestamp: string; // In-game time string (e.g., "10:30 AM")
  createdAt: number; // Real timestamp for ordering/expiration
}

/**
 * First names for random parker name generation
 */
const FIRST_NAMES = [
  'Alex', 'Jordan', 'Taylor', 'Morgan', 'Casey', 'Riley', 'Quinn', 'Avery',
  'Parker', 'Skyler', 'Charlie', 'Drew', 'Jamie', 'Reese', 'Sage', 'Blair',
  'Sam', 'Max', 'Lou', 'Pat', 'Chris', 'Kim', 'Lee', 'Jo', 'Ash', 'Robin',
  'Emma', 'Liam', 'Olivia', 'Noah', 'Ava', 'Ethan', 'Sophia', 'Mason',
  'Isabella', 'Lucas', 'Mia', 'Oliver', 'Charlotte', 'Elijah', 'Amelia', 'James'
];

/**
 * Last names for random parker name generation
 */
const LAST_NAMES = [
  'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis',
  'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Wilson', 'Anderson', 'Thomas', 'Taylor',
  'Moore', 'Jackson', 'Martin', 'Lee', 'Thompson', 'White', 'Harris', 'Sanchez',
  'Clark', 'Ramirez', 'Lewis', 'Robinson', 'Walker', 'Young', 'Allen', 'King',
  'Wright', 'Scott', 'Torres', 'Nguyen', 'Hill', 'Flores', 'Green', 'Adams',
  'Nelson', 'Baker', 'Hall', 'Rivera', 'Campbell', 'Mitchell', 'Carter', 'Roberts'
];

/**
 * MessageSystem - Manages game messages and parker reactions
 * 
 * Displays messages in the right panel for:
 * - Parker reactions to negative factors (can't park, unfulfilled needs, etc.)
 * - Tutorial messages
 * - System notifications
 */
export class MessageSystem {
  private static instance: MessageSystem;
  
  private messages: GameMessage[] = [];
  private readonly maxMessages: number = 50; // Max messages to keep in memory
  private readonly displayMessages: number = 8; // Max messages to display at once
  private messageContainer: HTMLElement | null = null;
  private messageIdCounter: number = 0;
  private tutorialContainer: HTMLElement | null = null;
  private tutorialOkButton: HTMLButtonElement | null = null;

  private constructor() {}
  
  static getInstance(): MessageSystem {
    if (!MessageSystem.instance) {
      MessageSystem.instance = new MessageSystem();
    }
    return MessageSystem.instance;
  }
  
  /**
   * Initialize the message panel in the DOM
   * Should be called once when the scene starts
   */
  initializePanel(): void {
    // Check if panel already exists
    if (document.getElementById('messages-panel')) {
      this.messageContainer = document.getElementById('messages-container');
      return;
    }
    
    const rightPanel = document.getElementById('right-panel');
    if (!rightPanel) {
      console.warn('Right panel not found, messages will not be displayed');
      return;
    }
    
    // Create messages panel
    const messagesPanel = document.createElement('div');
    messagesPanel.id = 'messages-panel';
    const messageBoxHeight = '50vh';
    messagesPanel.innerHTML = `
      <div class="section-title" style="margin-top: 0; margin-bottom: 10px;">Messages</div>
      <div id="tutorial-step-container" style="
        display: none;
        height: ${messageBoxHeight};
        min-height: 180px;
        margin-bottom: 15px;
        padding: 12px;
        background: #1a1a1a;
        border: 1px solid #4a4a4a;
        border-radius: 4px;
        overflow-y: auto;
        box-sizing: border-box;
      ">
        <div id="tutorial-step-text" style="color: #ddd; font-size: 13px; line-height: 1.5; margin-bottom: 12px;"></div>
        <button type="button" id="tutorial-ok-button" class="action-button" style="margin-bottom: 0;">OK</button>
      </div>
      <div id="messages-container" style="
        height: ${messageBoxHeight};
        min-height: 180px;
        overflow-y: auto;
        background: #1a1a1a;
        border: 1px solid #3a3a3a;
        border-radius: 4px;
        padding: 8px;
        margin-bottom: 15px;
        font-size: 11px;
        line-height: 1.4;
        box-sizing: border-box;
      "></div>
    `;

    // Insert at the beginning of the right panel
    rightPanel.insertBefore(messagesPanel, rightPanel.firstChild);

    this.messageContainer = document.getElementById('messages-container');
    this.tutorialContainer = document.getElementById('tutorial-step-container');
    this.tutorialOkButton = document.getElementById('tutorial-ok-button') as HTMLButtonElement | null;
    this.renderMessages();
  }

  /**
   * Show a single tutorial step with message and OK button. Hides the normal messages list.
   * When OK is clicked, onOk is called and the tutorial UI is hidden (call hideTutorialStep from onOk if needed).
   */
  showTutorialStep(text: string, onOk: () => void): void {
    if (!this.tutorialContainer || !this.tutorialOkButton) return;
    const textEl = document.getElementById('tutorial-step-text');
    const listEl = document.getElementById('messages-container');
    if (textEl) textEl.textContent = text;
    if (this.tutorialContainer) this.tutorialContainer.style.display = 'block';
    if (listEl) listEl.style.display = 'none';

    const handler = (): void => {
      this.tutorialOkButton?.removeEventListener('click', handler);
      if (this.tutorialContainer) this.tutorialContainer.style.display = 'none';
      const list = document.getElementById('messages-container');
      if (list) list.style.display = 'block';
      onOk();
    };
    this.tutorialOkButton.addEventListener('click', handler);
  }

  /** Hide the tutorial step UI and show the normal messages list. */
  hideTutorialStep(): void {
    if (this.tutorialContainer) this.tutorialContainer.style.display = 'none';
    const list = document.getElementById('messages-container');
    if (list) list.style.display = 'block';
  }
  
  /**
   * Generate a random parker name (first name + last name)
   * Names are assigned once when the vehicle is created, ensuring consistency
   * across multiple messages for the same parker
   */
  static generateParkerName(): string {
    const firstName = FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)];
    const lastName = LAST_NAMES[Math.floor(Math.random() * LAST_NAMES.length)];
    return `${firstName} ${lastName}`;
  }
  
  /**
   * Get current in-game time as formatted string
   */
  private getCurrentTimeString(): string {
    const timeSystem = TimeSystem.getInstance();
    return timeSystem.getTimeString();
  }
  
  /**
   * Add a parker reaction message
   */
  addParkerReaction(parkerName: string, text: string, emoji: string): void {
    const message: GameMessage = {
      id: `msg-${++this.messageIdCounter}`,
      type: 'parker_reaction',
      parkerName,
      text,
      emoji,
      timestamp: this.getCurrentTimeString(),
      createdAt: Date.now()
    };
    
    this.addMessage(message);
  }
  
  /**
   * Add a system message
   */
  addSystemMessage(text: string, emoji: string = 'ℹ️'): void {
    const message: GameMessage = {
      id: `msg-${++this.messageIdCounter}`,
      type: 'system',
      text,
      emoji,
      timestamp: this.getCurrentTimeString(),
      createdAt: Date.now()
    };
    
    this.addMessage(message);
  }
  
  /**
   * Add a tutorial message
   */
  addTutorialMessage(text: string, emoji: string = '💡'): void {
    const message: GameMessage = {
      id: `msg-${++this.messageIdCounter}`,
      type: 'tutorial',
      text,
      emoji,
      timestamp: this.getCurrentTimeString(),
      createdAt: Date.now()
    };
    
    this.addMessage(message);
  }
  
  /**
   * Internal method to add a message and update display
   */
  private addMessage(message: GameMessage): void {
    this.messages.unshift(message); // Add to beginning (newest first)
    
    // Trim to max messages
    if (this.messages.length > this.maxMessages) {
      this.messages = this.messages.slice(0, this.maxMessages);
    }
    
    this.renderMessages();
  }
  
  /**
   * Render messages to the DOM
   */
  private renderMessages(): void {
    if (!this.messageContainer) return;
    
    const displayedMessages = this.messages.slice(0, this.displayMessages);
    
    if (displayedMessages.length === 0) {
      this.messageContainer.innerHTML = '<div style="color: #666; font-style: italic;">No messages yet...</div>';
      return;
    }
    
    this.messageContainer.innerHTML = displayedMessages.map(msg => {
      if (msg.type === 'parker_reaction' && msg.parkerName) {
        return `
          <div style="margin-bottom: 8px; padding-bottom: 8px; border-bottom: 1px solid #333;">
            <div style="color: #888; font-size: 10px;">${msg.timestamp}</div>
            <div style="color: #4a9eff; font-weight: bold;">${msg.parkerName}:</div>
            <div style="color: #ddd;">"${msg.text}" ${msg.emoji}</div>
          </div>
        `;
      } else {
        return `
          <div style="margin-bottom: 8px; padding-bottom: 8px; border-bottom: 1px solid #333;">
            <div style="color: #888; font-size: 10px;">${msg.timestamp}</div>
            <div style="color: #ddd;">${msg.emoji} ${msg.text}</div>
          </div>
        `;
      }
    }).join('');
    
    // Scroll to top (newest messages)
    this.messageContainer.scrollTop = 0;
  }
  
  /**
   * Get all messages
   */
  getMessages(): GameMessage[] {
    return [...this.messages];
  }
  
  /**
   * Clear all messages
   */
  clearMessages(): void {
    this.messages = [];
    this.renderMessages();
  }
  
  /**
   * Reset the message system
   */
  reset(): void {
    this.messages = [];
    this.messageIdCounter = 0;
    this.renderMessages();
  }
  
  // ============================================
  // Convenience methods for common parker reactions
  // ============================================
  
  /**
   * Parker couldn't find a parking spot
   */
  static noSpotAvailable(parkerName: string): void {
    MessageSystem.getInstance().addParkerReaction(
      parkerName,
      "I can't find a spot to park!",
      '😠'
    );
  }
  
  /**
   * Parker couldn't satisfy thirst need
   */
  static thirstUnfulfilled(parkerName: string): void {
    MessageSystem.getInstance().addParkerReaction(
      parkerName,
      "I wish there was a vending machine here, I'm so thirsty.",
      '🥵'
    );
  }
  
  /**
   * Parker couldn't satisfy toilet need
   */
  static toiletUnfulfilled(parkerName: string): void {
    MessageSystem.getInstance().addParkerReaction(
      parkerName,
      "I gotta rush home to use the toilet! No porta-potty here!",
      '😰'
    );
  }
  
  /**
   * Parker couldn't satisfy trash need
   */
  static trashUnfulfilled(parkerName: string): void {
    MessageSystem.getInstance().addParkerReaction(
      parkerName,
      "I don't want this trash- guess I'll drop it.",
      '😬'
    );
  }
  
  /**
   * Vehicle drove on too many concrete/sidewalk tiles
   */
  static droveonSidewalk(parkerName: string): void {
    MessageSystem.getInstance().addParkerReaction(
      parkerName,
      "My car is on the sidewalk! This feels awkward.",
      '😅'
    );
  }
  
  /**
   * Pedestrian walked on insufficient concrete tiles (sidewalk complaint)
   */
  static insufficientSidewalk(parkerName: string): void {
    MessageSystem.getInstance().addParkerReaction(
      parkerName,
      "Why is there no sidewalk to walk on here?",
      '😤'
    );
  }
}

