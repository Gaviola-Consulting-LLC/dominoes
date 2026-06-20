/**
 * Dominoes - Jailhouse Rules
 *
 * Jailhouse rules:
 *  • You MUST play a tile if you are able to.
 *  • If you cannot play, draw from the boneyard until you can, or until empty.
 *  • If the boneyard is empty and you still cannot play, you pass.
 *  • Going out scores the total pip count of the opponent's remaining hand.
 *  • If the board blocks (both players pass consecutively), the player with
 *    fewer pips in hand wins and scores the opponent's pip total.
 *  • A round ends when one player reaches 250 points.
 *  • Any number of rounds (games) may be played.
 */

'use strict';

// ─── Pip layout in a 3×3 grid ──────────────────────────────────────────────
//  Position indices:
//   0 | 1 | 2
//  ───┼───┼───
//   3 | 4 | 5
//  ───┼───┼───
//   6 | 7 | 8
const PIP_POSITIONS = {
  0: [],
  1: [4],
  2: [2, 6],
  3: [2, 4, 6],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 3, 6, 2, 5, 8],
};

const TARGET_SCORE  = 250;
const HAND_SIZE     = 7;
const COMPUTER_DELAY_PLAY = 900;   // ms before computer plays a tile
const COMPUTER_DELAY_DRAW = 600;   // ms between computer draw steps

// ─── Tile ───────────────────────────────────────────────────────────────────
class Tile {
  constructor(a, b) {
    this.a = a;
    this.b = b;
    this.pips     = a + b;
    this.isDouble = a === b;
  }
  /** Return a new tile with sides swapped. */
  flipped() { return new Tile(this.b, this.a); }
  toString() { return `[${this.a}|${this.b}]`; }
}

// ─── Board ──────────────────────────────────────────────────────────────────
class Board {
  constructor() {
    this.chain    = [];    // Tile[] displayed left-to-right
    this.leftEnd  = null;
    this.rightEnd = null;
  }

  get isEmpty() { return this.chain.length === 0; }

  /**
   * Returns which ends ('left', 'right') the tile can connect to.
   * When the board is symmetric (leftEnd === rightEnd) the player is not
   * prompted; we always return ['right'] to avoid an unnecessary choice.
   */
  playableEnds(tile) {
    if (this.isEmpty) return ['right'];

    if (this.leftEnd === this.rightEnd) {
      return (tile.a === this.leftEnd || tile.b === this.leftEnd)
        ? ['right']
        : [];
    }

    const ends = [];
    if (tile.a === this.leftEnd  || tile.b === this.leftEnd)  ends.push('left');
    if (tile.a === this.rightEnd || tile.b === this.rightEnd) ends.push('right');
    return ends;
  }

  canPlay(tile) {
    return this.isEmpty || this.playableEnds(tile).length > 0;
  }

  /** Place a tile at the specified end, orienting it correctly. */
  play(tile, end) {
    if (this.isEmpty) {
      this.chain.push(tile);
      this.leftEnd  = tile.a;
      this.rightEnd = tile.b;
      return;
    }

    if (end === 'left') {
      // tile's RIGHT side must connect to leftEnd; flip if needed
      const placed = tile.b === this.leftEnd ? tile : tile.flipped();
      this.chain.unshift(placed);
      this.leftEnd = placed.a;
    } else {
      // tile's LEFT side must connect to rightEnd; flip if needed
      const placed = tile.a === this.rightEnd ? tile : tile.flipped();
      this.chain.push(placed);
      this.rightEnd = placed.b;
    }
  }
}

// ─── Game State ─────────────────────────────────────────────────────────────
const state = {
  // Round-level scores
  playerScore:   0,
  computerScore: 0,
  roundNum:      1,

  // Hand-level data
  board:         null,
  playerHand:    [],
  computerHand:  [],
  boneyard:      [],

  turn:          null,  // 'player' | 'computer'
  passCount:     0,
  phase:         'idle',        // 'idle' | 'hand' | 'end_selection' | 'hand_over'
  pendingTile:   null,          // Tile awaiting left/right choice
};

// ─── Deck helpers ───────────────────────────────────────────────────────────
function createDeck() {
  const tiles = [];
  for (let a = 0; a <= 6; a++)
    for (let b = a; b <= 6; b++)
      tiles.push(new Tile(a, b));
  return shuffled(tiles);
}

function shuffled(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function removeFromHand(hand, tile) {
  const idx = hand.indexOf(tile);
  if (idx !== -1) hand.splice(idx, 1);
}

function highestDouble(hand) {
  return hand
    .filter(t => t.isDouble)
    .reduce((best, t) => (!best || t.a > best.a ? t : best), null);
}

function highestPipsTile(hand) {
  return hand.reduce((best, t) => (t.pips > best.pips ? t : best));
}

// ─── Start a new hand ───────────────────────────────────────────────────────
function startHand() {
  const deck           = createDeck();
  state.board          = new Board();
  state.playerHand     = deck.slice(0, HAND_SIZE);
  state.computerHand   = deck.slice(HAND_SIZE, HAND_SIZE * 2);
  state.boneyard       = deck.slice(HAND_SIZE * 2);
  state.passCount      = 0;
  state.pendingTile    = null;
  state.phase          = 'hand';

  // Determine first tile: highest double, falling back to highest pip tile
  const pd = highestDouble(state.playerHand);
  const cd = highestDouble(state.computerHand);

  let firstTile, firstPlayer;
  if (pd && (!cd || pd.a > cd.a)) {
    firstTile = pd;  firstPlayer = 'player';
  } else if (cd) {
    firstTile = cd;  firstPlayer = 'computer';
  } else {
    const ph = highestPipsTile(state.playerHand);
    const ch = highestPipsTile(state.computerHand);
    if (ph.pips >= ch.pips) { firstTile = ph; firstPlayer = 'player'; }
    else                    { firstTile = ch; firstPlayer = 'computer'; }
  }

  removeFromHand(
    firstPlayer === 'player' ? state.playerHand : state.computerHand,
    firstTile
  );
  state.board.play(firstTile, 'right');

  // The other player takes the first turn
  state.turn = firstPlayer === 'player' ? 'computer' : 'player';

  render();
  const who = firstPlayer === 'player' ? 'You' : 'Computer';
  setMessage(`${who} led with ${firstTile}.`, 'info');
  updateButtons();

  if (state.turn === 'computer') {
    setTimeout(computerTurn, COMPUTER_DELAY_PLAY);
  }
}

// ─── Player actions ─────────────────────────────────────────────────────────
function onTileClick(tile) {
  if (state.turn !== 'player' || state.phase !== 'hand') return;

  // Clicking the already-selected tile cancels the selection
  if (state.pendingTile === tile) {
    state.pendingTile = null;
    state.phase       = 'hand';
    render();
    updateButtons();
    return;
  }

  const ends = state.board.playableEnds(tile);
  if (ends.length === 0) return;

  if (ends.length === 1) {
    commitPlay(tile, ends[0]);
  } else {
    // Two valid ends — ask the player to choose
    state.pendingTile = tile;
    state.phase       = 'end_selection';
    document.getElementById('left-end-val').textContent  = state.board.leftEnd;
    document.getElementById('right-end-val').textContent = state.board.rightEnd;
    setMessage(
      `Choose which end to attach ${tile}: Left (${state.board.leftEnd}) or Right (${state.board.rightEnd}).`,
      'info'
    );
    render();
    updateButtons();
  }
}

function onChooseEnd(end) {
  if (state.phase !== 'end_selection' || !state.pendingTile) return;
  const tile        = state.pendingTile;
  state.pendingTile = null;
  state.phase       = 'hand';
  commitPlay(tile, end);
}

function commitPlay(tile, end) {
  removeFromHand(state.playerHand, tile);
  state.board.play(tile, end);
  state.passCount = 0;
  render();

  if (state.playerHand.length === 0) {
    setTimeout(() => endHand('player_out'), 350);
    return;
  }

  state.turn = 'computer';
  updateButtons();
  setTimeout(computerTurn, COMPUTER_DELAY_PLAY);
}

function onDraw() {
  if (state.turn !== 'player' || state.phase !== 'hand') return;
  if (state.boneyard.length === 0) return;

  const tile = state.boneyard.pop();
  state.playerHand.push(tile);
  setMessage(`You drew ${tile}.`, 'info');
  render();
  updateButtons();
}

function onPass() {
  if (state.turn !== 'player' || state.phase !== 'hand') return;

  state.passCount++;
  setMessage('You passed.', 'warn');

  if (state.passCount >= 2) {
    setTimeout(() => endHand('blocked'), 350);
    return;
  }

  state.turn = 'computer';
  render();
  updateButtons();
  setTimeout(computerTurn, COMPUTER_DELAY_PLAY);
}

// ─── Computer AI ────────────────────────────────────────────────────────────
function computerTurn() {
  if (state.turn !== 'computer') return;

  const playable = state.computerHand.filter(t => state.board.canPlay(t));

  if (playable.length > 0) {
    const tile = bestComputerTile(playable);
    const ends = state.board.playableEnds(tile);
    // When a tile fits both ends, prefer the side that exposes a rarer value
    const end  = ends.length > 1 ? pickBestEnd(tile) : ends[0];

    removeFromHand(state.computerHand, tile);
    state.board.play(tile, end);
    state.passCount = 0;

    setMessage(`Computer played ${tile}.`, 'info');
    render();

    if (state.computerHand.length === 0) {
      setTimeout(() => endHand('computer_out'), 400);
      return;
    }

    state.turn = 'player';
    updateButtons();

  } else if (state.boneyard.length > 0) {
    const tile = state.boneyard.pop();
    state.computerHand.push(tile);
    setMessage('Computer drew from boneyard.', 'info');
    render();
    setTimeout(computerTurn, COMPUTER_DELAY_DRAW);

  } else {
    // Must pass
    state.passCount++;
    setMessage('Computer passed.', 'warn');

    if (state.passCount >= 2) {
      setTimeout(() => endHand('blocked'), 400);
      return;
    }

    state.turn = 'player';
    render();
    updateButtons();
  }
}

/**
 * Choose the best tile for the computer to play.
 * Strategy: shed doubles first (they can become traps), then highest pip count.
 */
function bestComputerTile(playable) {
  const doubles = playable.filter(t => t.isDouble);
  const pool    = doubles.length ? doubles : playable;
  return pool.reduce((best, t) => (t.pips > best.pips ? t : best));
}

/**
 * When a tile can play on either end, pick the end that leaves the computer
 * with the most future options. Uses the computer's own hand only (no peeking
 * at the player's tiles).
 */
function pickBestEnd(tile) {
  const remaining = state.computerHand.filter(t => t !== tile);

  // New exposed end value after placing on left vs right
  const newLeftVal  = tile.b === state.board.leftEnd  ? tile.a : tile.b;
  const newRightVal = tile.a === state.board.rightEnd ? tile.b : tile.a;

  // Count distinct computer tiles that can play on the resulting board
  const hasMatch = (t, v1, v2) => t.a === v1 || t.b === v1 || t.a === v2 || t.b === v2;
  const countLeft  = remaining.filter(t => hasMatch(t, newLeftVal,          state.board.rightEnd)).length;
  const countRight = remaining.filter(t => hasMatch(t, state.board.leftEnd, newRightVal)).length;

  return countLeft >= countRight ? 'left' : 'right';
}

// ─── End of a hand ──────────────────────────────────────────────────────────
function endHand(reason) {
  state.phase = 'hand_over';

  const pp = state.playerHand.reduce((s, t) => s + t.pips, 0);
  const cp = state.computerHand.reduce((s, t) => s + t.pips, 0);

  let winner, points;
  if (reason === 'player_out') {
    winner = 'player';   points = cp;
  } else if (reason === 'computer_out') {
    winner = 'computer'; points = pp;
  } else {
    // Blocked — lower pip count wins
    if      (pp < cp) { winner = 'player';   points = cp; }
    else if (cp < pp) { winner = 'computer'; points = pp; }
    else              { winner = 'draw';     points = 0;  }
  }

  if      (winner === 'player')   state.playerScore   += points;
  else if (winner === 'computer') state.computerScore += points;

  render();   // show final board state

  // ── Build result text ──────────────────────────────────────────────────
  let resultLine;
  if (reason === 'player_out') {
    resultLine = `You went out! You score <strong>${points}</strong> point${points !== 1 ? 's' : ''}.`;
  } else if (reason === 'computer_out') {
    resultLine = `Computer went out! Computer scores <strong>${points}</strong> point${points !== 1 ? 's' : ''}.`;
  } else if (winner === 'player') {
    resultLine = `Board blocked! You win (${pp} vs ${cp} pips). You score <strong>${points}</strong> points.`;
  } else if (winner === 'computer') {
    resultLine = `Board blocked! Computer wins (${cp} vs ${pp} pips). Computer scores <strong>${points}</strong> points.`;
  } else {
    resultLine = `Board blocked! It's a tie (${pp} pips each). No points scored.`;
  }

  const scoreLine = `You: <strong>${state.playerScore}</strong>&nbsp;&nbsp;|&nbsp;&nbsp;Computer: <strong>${state.computerScore}</strong>`;

  // ── Check round over ───────────────────────────────────────────────────
  const roundOver = state.playerScore >= TARGET_SCORE || state.computerScore >= TARGET_SCORE;

  if (roundOver) {
    const roundWinner = state.playerScore >= TARGET_SCORE ? 'You' : 'Computer';
    showModal(
      `Round ${state.roundNum} Complete!`,
      `${resultLine}<br><br>${scoreLine}<br><br>` +
        `<strong>${roundWinner} won the round!</strong>`,
      'Play Another Round',
      startNewRound,
      'Main Menu',
      showWelcomeModal
    );
  } else {
    showModal(
      'Hand Over',
      `${resultLine}<br><br>${scoreLine}`,
      'Next Hand',
      () => { closeModal(); startHand(); }
    );
  }
}

function startNewRound() {
  state.playerScore   = 0;
  state.computerScore = 0;
  state.roundNum     += 1;
  closeModal();
  startHand();
}

// ─── Rendering ──────────────────────────────────────────────────────────────
function render() {
  renderBoard();
  renderPlayerHand();
  renderComputerHand();
  updateScoreboard();
}

// ── Board ────────────────────────────────────────────────────────────────────
function renderBoard() {
  const boardEl = document.getElementById('board');
  boardEl.innerHTML = '';

  document.getElementById('boneyard-count').textContent =
    state.boneyard ? state.boneyard.length : 28;

  if (!state.board || state.board.isEmpty) {
    const empty = document.createElement('span');
    empty.className   = 'board-empty';
    empty.textContent = 'Board is empty - waiting for the hand to begin...';
    boardEl.appendChild(empty);
    return;
  }

  const inSelection = state.phase === 'end_selection';

  // Left-end label
  const leftLbl = document.createElement('span');
  leftLbl.className   = 'end-label' + (inSelection ? ' active' : '');
  leftLbl.textContent = `← ${state.board.leftEnd}`;
  if (inSelection) {
    leftLbl.style.cursor = 'pointer';
    leftLbl.addEventListener('click', () => onChooseEnd('left'));
  }
  boardEl.appendChild(leftLbl);

  // Board tiles
  state.board.chain.forEach(tile => {
    boardEl.appendChild(makeTileEl(tile, false, false));
  });

  // Right-end label
  const rightLbl = document.createElement('span');
  rightLbl.className   = 'end-label' + (inSelection ? ' active' : '');
  rightLbl.textContent = `${state.board.rightEnd} →`;
  if (inSelection) {
    rightLbl.style.cursor = 'pointer';
    rightLbl.addEventListener('click', () => onChooseEnd('right'));
  }
  boardEl.appendChild(rightLbl);
}

// ── Player hand ──────────────────────────────────────────────────────────────
function renderPlayerHand() {
  const handEl = document.getElementById('player-hand');
  handEl.innerHTML = '';
  if (!state.playerHand) return;

  const isMyTurn = state.turn === 'player' && state.phase === 'hand';

  state.playerHand.forEach(tile => {
    const canPlay  = state.board ? state.board.canPlay(tile) : false;
    const clickable = canPlay && isMyTurn;
    const el       = makeTileEl(tile, false, clickable);

    if (tile === state.pendingTile) el.classList.add('selected');
    if (clickable) el.addEventListener('click', () => onTileClick(tile));

    handEl.appendChild(el);
  });
}

// ── Computer hand (face-down) ────────────────────────────────────────────────
function renderComputerHand() {
  const handEl = document.getElementById('computer-hand');
  handEl.innerHTML = '';
  document.getElementById('computer-count').textContent =
    state.computerHand ? state.computerHand.length : 0;

  if (!state.computerHand) return;
  state.computerHand.forEach(() => {
    const el = document.createElement('div');
    el.className = 'domino face-down';
    el.innerHTML = '<div class="domino-back"></div>';
    handEl.appendChild(el);
  });
}

// ── Scoreboard ───────────────────────────────────────────────────────────────
function updateScoreboard() {
  document.getElementById('player-score').textContent   = state.playerScore;
  document.getElementById('computer-score').textContent = state.computerScore;
  document.getElementById('round-info').textContent     =
    `Round ${state.roundNum} · First to ${TARGET_SCORE} pts`;
}

// ── Button states ────────────────────────────────────────────────────────────
function updateButtons() {
  const drawBtn      = document.getElementById('draw-btn');
  const passBtn      = document.getElementById('pass-btn');
  const leftEndBtn   = document.getElementById('left-end-btn');
  const rightEndBtn  = document.getElementById('right-end-btn');

  if (state.phase === 'end_selection') {
    drawBtn.disabled    = true;
    passBtn.disabled    = true;
    leftEndBtn.classList.remove('hidden');
    rightEndBtn.classList.remove('hidden');
    return;
  }

  leftEndBtn.classList.add('hidden');
  rightEndBtn.classList.add('hidden');

  if (state.turn !== 'player' || state.phase !== 'hand') {
    drawBtn.disabled = true;
    passBtn.disabled = true;
    return;
  }

  const canPlay    = state.playerHand.some(t => state.board && state.board.canPlay(t));
  const hasBoneyard = state.boneyard.length > 0;

  if (canPlay) {
    // Jailhouse rule: must play when able
    drawBtn.disabled = true;
    passBtn.disabled = true;
    setMessage('Your turn - click a highlighted tile to play.', 'info');
  } else if (hasBoneyard) {
    drawBtn.disabled = false;
    passBtn.disabled = true;
    setMessage('No playable tiles. Draw from the boneyard!', 'warn');
  } else {
    drawBtn.disabled = true;
    passBtn.disabled = false;
    setMessage('Boneyard empty and no playable tiles. You must pass.', 'warn');
  }
}

// ─── Tile element helpers ────────────────────────────────────────────────────
function makeTileEl(tile, faceDown = false, clickable = false) {
  const el = document.createElement('div');
  el.className = 'domino';
  if (faceDown)  el.classList.add('face-down');
  if (clickable) el.classList.add('playable');
  if (tile && tile.isDouble) el.classList.add('double');

  if (faceDown) {
    el.innerHTML = '<div class="domino-back"></div>';
  } else if (tile) {
    el.appendChild(makeHalfEl(tile.a));
    const div = document.createElement('div');
    div.className = 'domino-divider';
    el.appendChild(div);
    el.appendChild(makeHalfEl(tile.b));
  }
  return el;
}

function makeHalfEl(n) {
  const half = document.createElement('div');
  half.className = 'domino-half';

  const grid = document.createElement('div');
  grid.className = 'pip-grid';

  const positions = PIP_POSITIONS[n] || [];
  for (let i = 0; i < 9; i++) {
    const cell = document.createElement('div');
    cell.className = 'pip-cell';
    if (positions.includes(i)) {
      const pip = document.createElement('div');
      pip.className = 'pip';
      cell.appendChild(pip);
    }
    grid.appendChild(cell);
  }

  half.appendChild(grid);
  return half;
}

// ─── Message helper ──────────────────────────────────────────────────────────
function setMessage(msg, type = '') {
  const el = document.getElementById('message');
  if (!el) return;
  el.textContent = msg;
  el.className   = 'message ' + type;
}

// ─── Modal helpers ───────────────────────────────────────────────────────────
function showModal(title, bodyHtml, primaryLabel, primaryFn, secondaryLabel, secondaryFn) {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML    = bodyHtml;

  const pb = document.getElementById('modal-btn-primary');
  pb.textContent = primaryLabel;
  pb.onclick     = primaryFn;

  const sb = document.getElementById('modal-btn-secondary');
  if (secondaryLabel && secondaryFn) {
    sb.textContent = secondaryLabel;
    sb.onclick     = secondaryFn;
    sb.classList.remove('hidden');
  } else {
    sb.classList.add('hidden');
  }

  document.getElementById('modal-overlay').classList.remove('hidden');
}

function closeModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
}

// ─── Welcome / rules modal ───────────────────────────────────────────────────
function showWelcomeModal() {
  closeModal();
  showModal(
    '⬛ Dominoes - Jailhouse Rules',
    `<strong>How to play:</strong><br>
     ● You <em>must</em> play a tile if you are able to.<br>
     ● If you cannot play, draw from the boneyard.<br>
     ● You may only pass when the boneyard is empty.<br>
     ● Going out earns you the opponent's pip total.<br>
     ● A blocked board: lower pips wins the opponent's pip count.<br>
     <br>
     <strong>First player to reach ${TARGET_SCORE} points wins the round!</strong><br>
     Play as many rounds as you like.`,
    'Start New Game',
    () => {
      state.playerScore   = 0;
      state.computerScore = 0;
      state.roundNum      = 1;
      closeModal();
      startHand();
    }
  );
}

// ─── Boot ────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('draw-btn').addEventListener('click',      onDraw);
  document.getElementById('pass-btn').addEventListener('click',      onPass);
  document.getElementById('left-end-btn').addEventListener('click',  () => onChooseEnd('left'));
  document.getElementById('right-end-btn').addEventListener('click', () => onChooseEnd('right'));
  document.getElementById('new-game-btn').addEventListener('click',  showWelcomeModal);

  updateScoreboard();
  showWelcomeModal();
});
