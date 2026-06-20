/**
 * Dominoes - Jailhouse Rules
 *
 * Jailhouse rules:
 *  • You MUST play a tile if you are able to.
 *  • If you cannot play, draw from the boneyard until you can, or until empty.
 *  • If the boneyard is empty and you still cannot play, you pass.
 *  • Going out scores the total pip count of the opponent's remaining hand,
 *    rounded down to the nearest multiple of 5, with a minimum scoring hand of 5.
 *  • If the board blocks (both players pass consecutively), the player with
 *    fewer pips in hand wins and scores the opponent's pip total rounded down
 *    to the nearest multiple of 5, with a minimum scoring hand of 5.
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
const COMPUTER_DELAY_PLAY = 900;
const COMPUTER_DELAY_DRAW = 600;

class Tile {
  constructor(a, b) {
    this.a = a;
    this.b = b;
    this.pips     = a + b;
    this.isDouble = a === b;
  }
  flipped() { return new Tile(this.b, this.a); }
  toString() { return `[${this.a}|${this.b}]`; }
}

class Board {
  constructor() {
    this.chain    = [];
    this.leftEnd  = null;
    this.rightEnd = null;
  }

  get isEmpty() { return this.chain.length === 0; }

  playableEnds(tile) {
    if (this.isEmpty) return ['right'];

    const ends = [];
    if (tile.a === this.leftEnd  || tile.b === this.leftEnd)  ends.push('left');
    if (tile.a === this.rightEnd || tile.b === this.rightEnd) ends.push('right');
    return ends;
  }

  canPlay(tile) {
    return this.isEmpty || this.playableEnds(tile).length > 0;
  }

  play(tile, end) {
    if (this.isEmpty) {
      this.chain.push(tile);
      this.leftEnd  = tile.a;
      this.rightEnd = tile.b;
      return;
    }

    if (end === 'left') {
      const placed = tile.b === this.leftEnd ? tile : tile.flipped();
      this.chain.unshift(placed);
      this.leftEnd = placed.a;
    } else {
      const placed = tile.a === this.rightEnd ? tile : tile.flipped();
      this.chain.push(placed);
      this.rightEnd = placed.b;
    }
  }
}

const state = {
  playerScore:   0,
  computerScore: 0,
  roundNum:      1,
  board:         null,
  playerHand:    [],
  computerHand:  [],
  boneyard:      [],
  turn:          null,
  passCount:     0,
  phase:         'idle',
  pendingTile:   null,
  hoveredEnd:    null,
};

function createDeck() {
  const tiles = [];
  for (let a = 0; a <= 6; a++) {
    for (let b = a; b <= 6; b++) {
      tiles.push(new Tile(a, b));
    }
  }
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

function scoreToNearestFive(rawPoints) {
  if (rawPoints <= 0) return 0;
  return Math.max(5, rawPoints - (rawPoints % 5));
}

function orientTileForEnd(tile, end) {
  if (!state.board || state.board.isEmpty) return tile;

  if (end === 'left') {
    return tile.b === state.board.leftEnd ? tile : tile.flipped();
  }

  return tile.a === state.board.rightEnd ? tile : tile.flipped();
}

function clearPendingSelection() {
  state.pendingTile = null;
  state.hoveredEnd = null;
  if (state.phase === 'end_selection') {
    state.phase = 'hand';
  }
}

function startHand() {
  const deck           = createDeck();
  state.board          = new Board();
  state.playerHand     = deck.slice(0, HAND_SIZE);
  state.computerHand   = deck.slice(HAND_SIZE, HAND_SIZE * 2);
  state.boneyard       = deck.slice(HAND_SIZE * 2);
  state.passCount      = 0;
  state.pendingTile    = null;
  state.hoveredEnd     = null;
  state.phase          = 'hand';

  const pd = highestDouble(state.playerHand);
  const cd = highestDouble(state.computerHand);

  let firstTile, firstPlayer;
  if (pd && (!cd || pd.a > cd.a)) {
    firstTile = pd;
    firstPlayer = 'player';
  } else if (cd) {
    firstTile = cd;
    firstPlayer = 'computer';
  } else {
    const ph = highestPipsTile(state.playerHand);
    const ch = highestPipsTile(state.computerHand);
    if (ph.pips >= ch.pips) {
      firstTile = ph;
      firstPlayer = 'player';
    } else {
      firstTile = ch;
      firstPlayer = 'computer';
    }
  }

  removeFromHand(
    firstPlayer === 'player' ? state.playerHand : state.computerHand,
    firstTile
  );
  state.board.play(firstTile, 'right');
  state.turn = firstPlayer === 'player' ? 'computer' : 'player';

  render();
  const who = firstPlayer === 'player' ? 'You' : 'Computer';
  setMessage(`${who} led with ${firstTile}.`, 'info');
  updateButtons();

  if (state.turn === 'computer') {
    setTimeout(computerTurn, COMPUTER_DELAY_PLAY);
  }
}

function onTileClick(tile) {
  if (state.turn !== 'player') return;
  if (state.phase !== 'hand' && state.phase !== 'end_selection') return;

  if (state.pendingTile === tile) {
    clearPendingSelection();
    render();
    updateButtons();
    return;
  }

  const ends = state.board.playableEnds(tile);
  if (ends.length === 0) return;

  state.pendingTile = tile;
  state.hoveredEnd = null;

  if (ends.length === 1) {
    state.phase = 'end_selection';
    setMessage(`Selected ${tile}. Click the highlighted ${ends[0]} end to place it.`, 'info');
  } else {
    state.phase = 'end_selection';
    setMessage(
      `Selected ${tile}. Click the left or right end on the board to place it where you want.`,
      'info'
    );
  }

  render();
  updateButtons();
}

function onChooseEnd(end) {
  if (state.phase !== 'end_selection' || !state.pendingTile) return;

  const tile = state.pendingTile;
  const validEnds = state.board.playableEnds(tile);
  if (!validEnds.includes(end)) return;

  clearPendingSelection();
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
  clearPendingSelection();
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

function computerTurn() {
  if (state.turn !== 'computer') return;

  const playable = state.computerHand.filter(t => state.board.canPlay(t));

  if (playable.length > 0) {
    const tile = bestComputerTile(playable);
    const ends = state.board.playableEnds(tile);
    const end  = ends.length > 1 ? pickBestEnd(tile) : ends[0];

    removeFromHand(state.computerHand, tile);
    state.board.play(tile, end);
    state.passCount = 0;

    setMessage(`Computer played ${tile}.`, 'info');

    if (state.computerHand.length === 0) {
      render();
      setTimeout(() => endHand('computer_out'), 400);
      return;
    }

    state.turn = 'player';
    render();
    updateButtons();
  } else if (state.boneyard.length > 0) {
    const tile = state.boneyard.pop();
    state.computerHand.push(tile);
    setMessage('Computer drew from boneyard.', 'info');
    render();
    setTimeout(computerTurn, COMPUTER_DELAY_DRAW);
  } else {
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

function bestComputerTile(playable) {
  const doubles = playable.filter(t => t.isDouble);
  const pool    = doubles.length ? doubles : playable;
  return pool.reduce((best, t) => (t.pips > best.pips ? t : best));
}

function pickBestEnd(tile) {
  const remaining = state.computerHand.filter(t => t !== tile);
  const newLeftVal  = tile.b === state.board.leftEnd  ? tile.a : tile.b;
  const newRightVal = tile.a === state.board.rightEnd ? tile.b : tile.a;
  const hasMatch = (t, v1, v2) => t.a === v1 || t.b === v1 || t.a === v2 || t.b === v2;
  const countLeft  = remaining.filter(t => hasMatch(t, newLeftVal, state.board.rightEnd)).length;
  const countRight = remaining.filter(t => hasMatch(t, state.board.leftEnd, newRightVal)).length;

  return countLeft >= countRight ? 'left' : 'right';
}

function endHand(reason) {
  state.phase = 'hand_over';
  state.pendingTile = null;
  state.hoveredEnd = null;

  const pp = state.playerHand.reduce((s, t) => s + t.pips, 0);
  const cp = state.computerHand.reduce((s, t) => s + t.pips, 0);

  let winner, rawPoints;
  if (reason === 'player_out') {
    winner = 'player';
    rawPoints = cp;
  } else if (reason === 'computer_out') {
    winner = 'computer';
    rawPoints = pp;
  } else {
    if (pp < cp) {
      winner = 'player';
      rawPoints = cp;
    } else if (cp < pp) {
      winner = 'computer';
      rawPoints = pp;
    } else {
      winner = 'draw';
      rawPoints = 0;
    }
  }

  const points = scoreToNearestFive(rawPoints);

  if (winner === 'player') state.playerScore += points;
  else if (winner === 'computer') state.computerScore += points;

  render();

  let resultLine;
  if (reason === 'player_out') {
    resultLine = `You went out! You score <strong>${points}</strong> points (${rawPoints} pips rounded to a multiple of 5).`;
  } else if (reason === 'computer_out') {
    resultLine = `Computer went out! Computer scores <strong>${points}</strong> points (${rawPoints} pips rounded to a multiple of 5).`;
  } else if (winner === 'player') {
    resultLine = `Board blocked! You win (${pp} vs ${cp} pips). You score <strong>${points}</strong> points (${rawPoints} rounded to a multiple of 5).`;
  } else if (winner === 'computer') {
    resultLine = `Board blocked! Computer wins (${cp} vs ${pp} pips). Computer scores <strong>${points}</strong> points (${rawPoints} rounded to a multiple of 5).`;
  } else {
    resultLine = `Board blocked! It's a tie (${pp} pips each). No points scored.`;
  }

  const scoreLine = `You: <strong>${state.playerScore}</strong>&nbsp;&nbsp;|&nbsp;&nbsp;Computer: <strong>${state.computerScore}</strong>`;
  const roundOver = state.playerScore >= TARGET_SCORE || state.computerScore >= TARGET_SCORE;

  if (roundOver) {
    const roundWinner = state.playerScore >= TARGET_SCORE ? 'You' : 'Computer';
    showModal(
      `Round ${state.roundNum} Complete!`,
      `${resultLine}<br><br>${scoreLine}<br><br><strong>${roundWinner} won the round!</strong>`,
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

function render() {
  renderBoard();
  renderPlayerHand();
  renderComputerHand();
  updateScoreboard();
}

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

  const selectedTile = state.pendingTile;
  const validEnds = selectedTile ? state.board.playableEnds(selectedTile) : [];
  const showTargets = state.phase === 'end_selection' && selectedTile;
  const previewEnd = state.hoveredEnd && validEnds.includes(state.hoveredEnd)
    ? state.hoveredEnd
    : validEnds.length === 1
      ? validEnds[0]
      : null;

  boardEl.appendChild(makeBoardDropZone('left', validEnds, showTargets));

  if (previewEnd === 'left') {
    const preview = makeTileEl(orientTileForEnd(selectedTile, 'left'), false, false);
    preview.classList.add('preview');
    boardEl.appendChild(preview);
  }

  state.board.chain.forEach(tile => {
    boardEl.appendChild(makeTileEl(tile, false, false));
  });

  if (previewEnd === 'right') {
    const preview = makeTileEl(orientTileForEnd(selectedTile, 'right'), false, false);
    preview.classList.add('preview');
    boardEl.appendChild(preview);
  }

  boardEl.appendChild(makeBoardDropZone('right', validEnds, showTargets));
}

function makeBoardDropZone(end, validEnds, showTargets) {
  const el = document.createElement('button');
  el.type = 'button';

  const isValid = showTargets && validEnds.includes(end);
  const isHovered = state.hoveredEnd === end;
  const labelValue = end === 'left' ? state.board.leftEnd : state.board.rightEnd;

  el.className = 'board-drop-zone';
  if (isValid) el.classList.add('active');
  if (isHovered) el.classList.add('hovered');

  el.textContent = end === 'left'
    ? `← Play on ${labelValue}`
    : `Play on ${labelValue} →`;

  el.disabled = !isValid;

  if (isValid) {
    el.addEventListener('mouseenter', () => {
      state.hoveredEnd = end;
      renderBoard();
    });
    el.addEventListener('mouseleave', () => {
      if (state.hoveredEnd === end) {
        state.hoveredEnd = null;
        renderBoard();
      }
    });
    el.addEventListener('click', () => onChooseEnd(end));
  }

  return el;
}

function renderPlayerHand() {
  const handEl = document.getElementById('player-hand');
  handEl.innerHTML = '';
  if (!state.playerHand) return;

  const isMyTurn = state.turn === 'player' && (state.phase === 'hand' || state.phase === 'end_selection');

  state.playerHand.forEach(tile => {
    const canPlay  = state.board ? state.board.canPlay(tile) : false;
    const clickable = canPlay && isMyTurn;
    const el = makeTileEl(tile, false, clickable);

    if (tile === state.pendingTile) el.classList.add('selected');
    if (clickable) el.addEventListener('click', () => onTileClick(tile));

    handEl.appendChild(el);
  });
}

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

function updateScoreboard() {
  document.getElementById('player-score').textContent   = state.playerScore;
  document.getElementById('computer-score').textContent = state.computerScore;
  document.getElementById('round-info').textContent     =
    `Round ${state.roundNum} · First to ${TARGET_SCORE} pts`;
}

function updateButtons() {
  const drawBtn      = document.getElementById('draw-btn');
  const passBtn      = document.getElementById('pass-btn');
  const leftEndBtn   = document.getElementById('left-end-btn');
  const rightEndBtn  = document.getElementById('right-end-btn');

  leftEndBtn.classList.add('hidden');
  rightEndBtn.classList.add('hidden');

  if (state.phase === 'end_selection') {
    drawBtn.disabled = true;
    passBtn.disabled = true;
    return;
  }

  if (state.turn !== 'player' || state.phase !== 'hand') {
    drawBtn.disabled = true;
    passBtn.disabled = true;
    return;
  }

  const canPlay = state.playerHand.some(t => state.board && state.board.canPlay(t));
  const hasBoneyard = state.boneyard.length > 0;

  if (canPlay) {
    drawBtn.disabled = true;
    passBtn.disabled = true;
    setMessage('Your turn - select a highlighted tile, then click where you want it placed on the board.', 'info');
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

function makeTileEl(tile, faceDown = false, clickable = false) {
  const el = document.createElement('div');
  el.className = 'domino';
  if (faceDown) el.classList.add('face-down');
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

function setMessage(msg, type = '') {
  const el = document.getElementById('message');
  if (!el) return;
  el.textContent = msg;
  el.className   = 'message ' + type;
}

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

function showWelcomeModal() {
  closeModal();
  showModal(
    '⬛ Dominoes - Jailhouse Rules',
    `<strong>How to play:</strong><br>
     ● You <em>must</em> play a tile if you are able to.<br>
     ● Select a playable tile, then click the board end where you want it to go.<br>
     ● If you cannot play, draw from the boneyard.<br>
     ● You may only pass when the boneyard is empty.<br>
     ● Scoring is always in multiples of 5, with a minimum scoring hand of 5.<br>
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

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('draw-btn').addEventListener('click', onDraw);
  document.getElementById('pass-btn').addEventListener('click', onPass);
  document.getElementById('left-end-btn').addEventListener('click', () => onChooseEnd('left'));
  document.getElementById('right-end-btn').addEventListener('click', () => onChooseEnd('right'));
  document.getElementById('new-game-btn').addEventListener('click', showWelcomeModal);

  updateScoreboard();
  showWelcomeModal();
});
