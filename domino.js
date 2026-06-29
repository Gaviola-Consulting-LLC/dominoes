'use strict';

const STORAGE_KEY = 'domino-house-match';
const MATCH_RULES_VERSION = 3;
const WIN_SCORE = 250;
const HAND_SIZE = 7;
const DRAW_DELAY_MS = 250;
const COMPUTER_DELAY_MS = 650;
const SPINNER_SIDES = ['up', 'right', 'down', 'left'];
const DEBUG_SPINNER_TRACE = false;

const state = {
    match: null,
    computerTimer: null,
};

function createDeck() {
    const deck = [];
    for (let left = 0; left <= 6; left += 1) {
        for (let right = left; right <= 6; right += 1) {
            deck.push({ left, right, id: `${left}-${right}` });
        }
    }
    return shuffle(deck);
}

function shuffle(values) {
    const deck = [...values];
    for (let index = deck.length - 1; index > 0; index -= 1) {
        const swapIndex = Math.floor(Math.random() * (index + 1));
        [deck[index], deck[swapIndex]] = [deck[swapIndex], deck[index]];
    }
    return deck;
}

function cloneTile(tile) {
    return { left: tile.left, right: tile.right, id: tile.id };
}

function tilesToString(tiles) {
    return tiles.map(tile => `[${tile.left}|${tile.right}]`).join(' ');
}

function makeMatch() {
    const deck = createDeck();
    const human = deck.splice(0, HAND_SIZE);
    const computer = deck.splice(0, HAND_SIZE);
    const match = {
        rulesVersion: MATCH_RULES_VERSION,
        round: 1,
        humanScore: 0,
        computerScore: 0,
        humanHand: human,
        computerHand: computer,
        boneyard: deck,
        board: [],
        boardEnds: null,
        spinnerValue: null,
        spinnerAnchoredLeft: false,
        spinnerAnchoredRight: false,
        spinnerBranches: {
            up: [],
            right: [],
            down: [],
            left: [],
        },
        turn: 'human',
        phase: 'dealing',
        message: 'Dealing tiles...',
        winner: null,
        roundWinner: null,
        roundPoints: 0,
        log: ['New match started.'],
    };
    determineOpeningPlayer(match);
    return match;
}

function ensureSpinnerBranches(match) {
    if (!match || typeof match !== 'object') return;
    if (typeof match.spinnerAnchoredLeft !== 'boolean') {
        match.spinnerAnchoredLeft = false;
    }
    if (typeof match.spinnerAnchoredRight !== 'boolean') {
        match.spinnerAnchoredRight = false;
    }
    if (!match.spinnerBranches || typeof match.spinnerBranches !== 'object') {
        match.spinnerBranches = { up: [], right: [], down: [], left: [] };
    }
    SPINNER_SIDES.forEach(side => {
        if (!Array.isArray(match.spinnerBranches[side])) {
            match.spinnerBranches[side] = [];
        }
    });

    if (Array.isArray(match.spinnerBranch) && match.spinnerBranch.length) {
        match.spinnerBranches.right.push(...match.spinnerBranch);
        match.spinnerBranch = [];
    }

    // Migrate older saves that used split spinner branches.
    if (match.spinnerBranches && typeof match.spinnerBranches === 'object') {
        SPINNER_SIDES.forEach(side => {
            if (!Array.isArray(match.spinnerBranches[side])) {
                match.spinnerBranches[side] = [];
            }
        });
    }

    if (Array.isArray(match.spinnerMoves) && match.spinnerMoves.length) {
        const targetBranch = match.spinnerBranches.right;
        if (!targetBranch.length) {
            targetBranch.push(...match.spinnerMoves);
        }
        match.spinnerMoves = [];
    }
}

function determineOpeningPlayer(match) {
    const humanOpening = highestOpeningTile(match.humanHand);
    const computerOpening = highestOpeningTile(match.computerHand);

    if (humanOpening && computerOpening) {
        if (humanOpening.rank > computerOpening.rank) {
            match.turn = 'human';
            match.message = `You open with ${formatTile(humanOpening.tile)}.`;
        } else if (computerOpening.rank > humanOpening.rank) {
            match.turn = 'computer';
            match.message = `Computer opens with ${formatTile(computerOpening.tile)}.`;
        } else {
            match.turn = 'human';
            match.message = `Both players have the same opening rank. You start.`;
        }
        match.phase = 'playing';
        return;
    }

    if (humanOpening) {
        match.turn = 'human';
        match.message = `You open with ${formatTile(humanOpening.tile)}.`;
        match.phase = 'playing';
        return;
    }

    if (computerOpening) {
        match.turn = 'computer';
        match.message = `Computer opens with ${formatTile(computerOpening.tile)}.`;
        match.phase = 'playing';
        return;
    }

    match.message = 'No opening double was dealt, so the first legal move will start the round.';
    match.phase = 'playing';
    match.turn = 'human';
}

function highestOpeningTile(hand) {
    const doubles = hand.filter(tile => tile.left === tile.right)
        .sort((a, b) => b.left - a.left);
    if (doubles.length) {
        return {
            tile: cloneTile(doubles[0]),
            rank: doubles[0].left * 100,
        };
    }

    const ranked = [...hand].sort((a, b) => tileStrength(b) - tileStrength(a));
    if (!ranked.length) return null;
    return {
        tile: cloneTile(ranked[0]),
        rank: tileStrength(ranked[0]),
    };
}

function tileStrength(tile) {
    return (tile.left + tile.right) * 10 + Math.max(tile.left, tile.right);
}

function formatTile(tile) {
    return `[${tile.left}|${tile.right}]`;
}

function pipMarkup(value) {
    const filled = Math.max(0, Math.min(6, Number(value) || 0));
    const patterns = {
        0: [],
        1: ['c'],
        2: ['tl', 'br'],
        3: ['tl', 'c', 'br'],
        4: ['tl', 'tr', 'bl', 'br'],
        5: ['tl', 'tr', 'c', 'bl', 'br'],
        6: ['tl', 'ml', 'bl', 'tr', 'mr', 'br'],
    };
    const parts = patterns[filled].map(position => `<span class="pip filled pip-${position}"></span>`).join('');
    return `<span class="pip-grid pip-count-${filled}">${parts}</span>`;
}

function saveMatch() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.match));
}

function loadMatch() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') return null;
        if (parsed.rulesVersion !== MATCH_RULES_VERSION) {
            localStorage.removeItem(STORAGE_KEY);
            return null;
        }
        return parsed;
    } catch {
        return null;
    }
}

function clearComputerTimer() {
    if (state.computerTimer) {
        clearTimeout(state.computerTimer);
        state.computerTimer = null;
    }
}

function scheduleComputerTurn() {
    clearComputerTimer();
    if (!state.match || state.match.turn !== 'computer' || state.match.phase !== 'playing' || state.match.winner) return;
    state.computerTimer = setTimeout(() => {
        state.computerTimer = null;
        playComputerTurn();
    }, COMPUTER_DELAY_MS);
}

function getEnds(match = state.match) {
    if (!match.board.length) return null;
    return {
        left: match.boardEnds.left,
        right: match.boardEnds.right,
    };
}

function canTileMatch(tile, ends = getEnds(), spinnerValue = state.match.spinnerValue) {
    return legalPlacements(tile, ends, spinnerValue).length > 0;
}

function spinnerConnectsOnLeft(side) {
    return side === 'right' || side === 'down';
}

function spinnerBranchExposedValue(tile, side) {
    return spinnerConnectsOnLeft(side) ? tile.right : tile.left;
}

function spinnerUnmatchedPip(tile, target) {
    if (!tile || target === null || target === undefined) return null;
    if (tile.left === target && tile.right === target) return target;
    if (tile.left === target) return tile.right;
    if (tile.right === target) return tile.left;
    return null;
}

function spinnerBranchTarget(match, side, spinnerValue = match.spinnerValue) {
    const branch = match.spinnerBranches[side];
    if (!branch.length) return spinnerValue;
    let target = spinnerValue;
    for (let index = 0; index < branch.length; index += 1) {
        const tile = branch[index];
        const exposed = spinnerUnmatchedPip(tile, target);
        if (exposed === null) return null;
        target = exposed;
    }
    return target;
}

function spinnerHorizontalUnlocked(match = state.match) {
    if (!match) return false;
    ensureSpinnerBranches(match);
    const leftOccupied = match.spinnerAnchoredLeft || match.spinnerBranches.left.length > 0;
    const rightOccupied = match.spinnerAnchoredRight || match.spinnerBranches.right.length > 0;
    return leftOccupied && rightOccupied;
}

function spinnerVerticalUnlocked(match = state.match) {
    return spinnerHorizontalUnlocked(match);
}

function hasAnchoredSpinnerChain(match = state.match) {
    if (!match || match.spinnerValue === null) return false;
    return match.spinnerAnchoredLeft || match.spinnerAnchoredRight || match.board.length > 1;
}

function anchoredContinuationSide(match = state.match) {
    if (!match || match.spinnerValue === null) return null;
    if (match.spinnerAnchoredLeft && !match.spinnerAnchoredRight) return 'left';
    if (match.spinnerAnchoredRight && !match.spinnerAnchoredLeft) return 'right';

    // Fallback for older saved states where anchor flags may be missing.
    if (!Array.isArray(match.board) || !match.board.length) return null;
    const first = match.board[0];
    const last = match.board[match.board.length - 1];
    const isSpinnerTile = tile => tile && tile.left === match.spinnerValue && tile.right === match.spinnerValue;

    if (isSpinnerTile(first) && !isSpinnerTile(last)) return 'right';
    if (isSpinnerTile(last) && !isSpinnerTile(first)) return 'left';
    return null;
}

function requiredSpinnerHorizontalSide(match = state.match) {
    if (!match || match.spinnerValue === null) return null;
    ensureSpinnerBranches(match);
    if (spinnerHorizontalUnlocked(match)) return null;

    const leftOccupied = match.spinnerBranches.left.length > 0;
    const rightOccupied = match.spinnerBranches.right.length > 0;
    const anchoredSpinnerChain = hasAnchoredSpinnerChain(match);

    if (anchoredSpinnerChain) {
        if (leftOccupied && !rightOccupied) return 'left';
        if (rightOccupied && !leftOccupied) return 'right';

        if (match.spinnerAnchoredLeft && !rightOccupied) return 'right';
        if (match.spinnerAnchoredRight && !leftOccupied) return 'left';
        return null;
    }

    if (leftOccupied && !rightOccupied) return 'right';
    if (rightOccupied && !leftOccupied) return 'left';

    return null;
}

function spinnerSideUnlocked(match, branchSide) {
    ensureSpinnerBranches(match);
    const horizontalReady = spinnerHorizontalUnlocked(match);
    const requiredHorizontal = requiredSpinnerHorizontalSide(match);

    if (branchSide === 'left' || branchSide === 'right') {
        if (branchSide === 'left' && match.spinnerAnchoredLeft) return false;
        if (branchSide === 'right' && match.spinnerAnchoredRight) return false;
        if (requiredHorizontal) return branchSide === requiredHorizontal;
        if (horizontalReady) return true;
        const leftEmpty = !match.spinnerAnchoredLeft && match.spinnerBranches.left.length === 0;
        const rightEmpty = !match.spinnerAnchoredRight && match.spinnerBranches.right.length === 0;
        if (leftEmpty && rightEmpty) return true;
        return branchSide === 'left' ? leftEmpty : rightEmpty;
    }

    if (branchSide === 'up' || branchSide === 'down') return spinnerVerticalUnlocked(match);
    return false;
}

function isPlacementLegal(match, tile, side, ends = getEnds(match), spinnerValue = match.spinnerValue) {
    if (!match || !tile || !side) return false;
    if (!ends) return side === 'lead';

    const anchoredSpinnerChain = hasAnchoredSpinnerChain(match);
    const continuationSide = anchoredContinuationSide(match);

    if (spinnerValue === null || ((side === 'left' || side === 'right') && anchoredSpinnerChain)) {
        if (spinnerValue !== null && continuationSide && side !== continuationSide) return false;
        if (side === 'left') return tile.left === ends.left || tile.right === ends.left;
        if (side === 'right') return tile.left === ends.right || tile.right === ends.right;
        return false;
    }

    if (!side.startsWith('spinner-')) return false;
    const branchSide = side.replace('spinner-', '');
    if (!SPINNER_SIDES.includes(branchSide)) return false;
    const requiredHorizontal = requiredSpinnerHorizontalSide(match);
    if (requiredHorizontal && (branchSide === 'left' || branchSide === 'right') && branchSide !== requiredHorizontal) {
        return false;
    }
    if (!spinnerSideUnlocked(match, branchSide)) return false;

    const target = spinnerBranchTarget(match, branchSide, spinnerValue);
    if (target === null) return false;
    if (tile.left !== target && tile.right !== target) return false;

    const oriented = orientSpinnerTile(tile, target, branchSide);
    const connector = spinnerConnectsOnLeft(branchSide) ? oriented.left : oriented.right;
    if (connector !== target) return false;

    return spinnerUnmatchedPip(oriented, target) !== null;
}

function orientSpinnerTile(tile, target, side) {
    const connectOnLeft = spinnerConnectsOnLeft(side);
    if (connectOnLeft) {
        return tile.left === target
            ? { left: tile.left, right: tile.right, id: tile.id }
            : { left: tile.right, right: tile.left, id: tile.id };
    }
    return tile.right === target
        ? { left: tile.left, right: tile.right, id: tile.id }
        : { left: tile.right, right: tile.left, id: tile.id };
}

function legalPlacements(tile, ends = getEnds(), spinnerValue = state.match.spinnerValue) {
    const match = state.match;
    ensureSpinnerBranches(match);
    normalizeMatchForCurrentRules(match);
    if (!ends) return ['lead'];
    const canPlaceOnSide = side => isPlacementLegal(match, tile, side, ends, spinnerValue);
    const anchoredSpinnerChain = hasAnchoredSpinnerChain(match);
    const continuationSide = anchoredContinuationSide(match);

    const placements = [];
    if (spinnerValue === null || anchoredSpinnerChain) {
        if (spinnerValue !== null && continuationSide) {
            if (canPlaceOnSide(continuationSide)) placements.push(continuationSide);
        } else {
            if (canPlaceOnSide('left')) placements.push('left');
            if (canPlaceOnSide('right')) placements.push('right');
        }
    }

    if (spinnerValue === null) {
        return placements;
    }

    const eligibleSides = SPINNER_SIDES.filter(side => spinnerSideUnlocked(match, side));
    eligibleSides.forEach(side => {
        if (canPlaceOnSide(`spinner-${side}`)) placements.push(`spinner-${side}`);
    });
    return placements.filter(side => {
        if (!side.startsWith('spinner-')) return true;
        const branchSide = side.replace('spinner-', '');
        if (branchSide === 'up' || branchSide === 'down') {
            return spinnerVerticalUnlocked(match);
        }
        return true;
    });
}

function orientTile(tile, side) {
    if (!state.match.board.length) return cloneTile(tile);
    const ends = state.match.boardEnds;
    if (side === 'left') {
        if (tile.right === ends.left) return { left: tile.left, right: tile.right, id: tile.id };
        return { left: tile.right, right: tile.left, id: tile.id };
    }
    if (tile.left === ends.right) return { left: tile.left, right: tile.right, id: tile.id };
    return { left: tile.right, right: tile.left, id: tile.id };
}

function shouldRenderHorizontal(tile) {
    return tile.left !== tile.right;
}

function spinnerTileHorizontal(side, tile) {
    if (!tile) return false;
    if (side === 'up' || side === 'down') {
        return tile.left === tile.right;
    }
    return tile.left !== tile.right;
}

function normalizeMatchForCurrentRules(match) {
    if (!match || typeof match !== 'object') return;
    ensureSpinnerBranches(match);
    if (match.spinnerValue === null) {
        match.spinnerAnchoredLeft = false;
        match.spinnerAnchoredRight = false;
    }

    if (Array.isArray(match.board)) {
        match.board.forEach(tile => {
            if (!tile) return;
            tile.horizontal = shouldRenderHorizontal(tile);
        });
    }

    SPINNER_SIDES.forEach(side => {
        const branch = match.spinnerBranches[side];
        if (!Array.isArray(branch)) return;
        const normalizedBranch = [];
        let target = match.spinnerValue;
        branch.forEach(tile => {
            if (!tile) return;
            const exposed = spinnerUnmatchedPip(tile, target);
            if (exposed === null) return;
            tile.exposed = exposed;
            target = tile.exposed;
            tile.horizontal = spinnerTileHorizontal(side, tile);
            normalizedBranch.push(tile);
        });
        match.spinnerBranches[side] = normalizedBranch;
    });

    // Vertical spinner branches are only valid after both horizontal branches are occupied.
    if (match.spinnerValue !== null && !spinnerHorizontalUnlocked(match)) {
        match.spinnerBranches.up = [];
        match.spinnerBranches.down = [];
    }
}

function placeTile(tile, side) {
    const match = state.match;
    ensureSpinnerBranches(match);
    normalizeMatchForCurrentRules(match);
    const oriented = orientTile(tile, side);

    if (!match.board.length) {
        oriented.horizontal = shouldRenderHorizontal(oriented);
        match.board.push(oriented);
        match.boardEnds = { left: oriented.left, right: oriented.right };
        if (oriented.left === oriented.right) {
            match.spinnerValue = oriented.left;
            match.spinnerAnchoredLeft = false;
            match.spinnerAnchoredRight = false;
            match.spinnerBranches = { up: [], right: [], down: [], left: [] };
        }
        return true;
    }

    if (side.startsWith('spinner-')) {
        const branchSide = side.replace('spinner-', '');
        if (!SPINNER_SIDES.includes(branchSide)) {
            return false;
        }
        if (!isPlacementLegal(match, tile, side)) return false;
        const branch = match.spinnerBranches[branchSide];
        const target = spinnerBranchTarget(match, branchSide, match.spinnerValue);
        if (target === null || (tile.left !== target && tile.right !== target)) {
            return false;
        }
        const branchTile = orientSpinnerTile(tile, target, branchSide);
        const connector = spinnerConnectsOnLeft(branchSide) ? branchTile.left : branchTile.right;
        if (connector !== target) return false;
        branchTile.exposed = spinnerUnmatchedPip(branchTile, target);
        if (branchTile.exposed === null) return false;
        branchTile.horizontal = spinnerTileHorizontal(branchSide, branchTile);
        branch.push(branchTile);
        if (DEBUG_SPINNER_TRACE) {
            match.log.unshift(
                `[DEBUG] spinner-${branchSide} target=${target} connector=${connector} exposed=${branchTile.exposed} endsTotal=${exposedPipTotal(match)}`,
            );
        }
        return true;
    }

    if (side === 'left') {
        if (!isPlacementLegal(match, tile, side, match.boardEnds, match.spinnerValue)) {
            return false;
        }
        oriented.horizontal = shouldRenderHorizontal(oriented);
        match.board.unshift(oriented);
        match.boardEnds.left = oriented.left;
        if (match.spinnerValue === null && oriented.left === oriented.right) {
            match.spinnerValue = oriented.left;
            match.spinnerAnchoredLeft = false;
            match.spinnerAnchoredRight = true;
            match.spinnerBranches = { up: [], right: [], down: [], left: [] };
        }
        return true;
    }

    if (!isPlacementLegal(match, tile, side, match.boardEnds, match.spinnerValue)) {
        return false;
    }

    oriented.horizontal = shouldRenderHorizontal(oriented);
    match.board.push(oriented);
    match.boardEnds.right = oriented.right;
    if (match.spinnerValue === null && oriented.left === oriented.right) {
        match.spinnerValue = oriented.left;
        match.spinnerAnchoredLeft = true;
        match.spinnerAnchoredRight = false;
        match.spinnerBranches = { up: [], right: [], down: [], left: [] };
    }
    return true;
}

function exposedPipTotal(match = state.match) {
    if (!match || !match.board.length || !match.boardEnds) return 0;
    ensureSpinnerBranches(match);
    if (match.spinnerValue !== null) {
        let total = 0;
        const spinnerClosedHorizontally = spinnerHorizontalUnlocked(match);

        // Before both horizontal arms are occupied, the center spinner counts as a double end.
        if (!spinnerClosedHorizontally) {
            total += match.spinnerValue * 2;
        }

        SPINNER_SIDES.forEach(side => {
            const branch = match.spinnerBranches[side];
            if (!branch.length) return;
            const endTile = branch[branch.length - 1];
            const exposed = typeof endTile.exposed === 'number'
                ? endTile.exposed
                : spinnerBranchExposedValue(endTile, side);
            total += exposed;
            if (endTile.left === endTile.right) {
                total += exposed;
            }
        });

        return total;
    }

    const leftEndTile = match.board[0];
    const rightEndTile = match.board[match.board.length - 1];
    let total = match.boardEnds.left + match.boardEnds.right;
    if (leftEndTile && leftEndTile.left === leftEndTile.right) {
        total += match.boardEnds.left;
    }
    if (rightEndTile && rightEndTile.left === rightEndTile.right) {
        total += match.boardEnds.right;
    }
    return total;
}

function awardMovePoints(player) {
    const match = state.match;
    const total = exposedPipTotal(match);
    if (!match || total <= 0 || total % 5 !== 0) return 0;

    if (player === 'human') {
        match.humanScore += total;
    } else {
        match.computerScore += total;
    }

    const playerLabel = player === 'human' ? 'You' : 'Computer';
    match.log.unshift(`${playerLabel} scored ${total} points for a multiple of 5.`);

    if (match.humanScore >= WIN_SCORE || match.computerScore >= WIN_SCORE) {
        match.winner = match.humanScore >= WIN_SCORE ? 'human' : 'computer';
        match.phase = 'match-over';
        match.message = `${match.winner === 'human' ? 'You' : 'Computer'} reached ${WIN_SCORE} points and won the match.`;
        match.log.unshift(`${match.winner === 'human' ? 'You' : 'Computer'} won the match.`);
    }

    return total;
}

function drawUntilPlayable(player) {
    const handKey = `${player}Hand`;
    const match = state.match;
    const logPrefix = player === 'human' ? 'You' : 'Computer';
    let drew = false;

    while (match.boneyard.length) {
        const tile = match.boneyard.shift();
        match[handKey].push(tile);
        drew = true;
        match.log.unshift(`${logPrefix} drew ${formatTile(tile)} from the boneyard.`);
        if (canPlayAny(match[handKey])) {
            match.message = player === 'human'
                ? 'You drew a playable tile.'
                : 'Computer drew a playable tile.';
            saveMatch();
            render();
            return true;
        }
        saveMatch();
        render();
    }

    if (drew) {
        match.message = player === 'human'
            ? 'The boneyard is empty and you still cannot move.'
            : 'The boneyard is empty and the computer still cannot move.';
    }
    return false;
}

function canPlayAny(hand) {
    const ends = getEnds();
    return hand.some(tile => canTileMatch(tile, ends));
}

function chooseComputerMove() {
    const match = state.match;
    const ends = getEnds(match);
    const options = [];

    match.computerHand.forEach((tile, index) => {
        const placements = legalPlacements(tile, ends);
        placements.forEach(side => {
            if (!isPlacementLegal(match, tile, side, ends, match.spinnerValue)) return;
            options.push({
                index,
                side,
                tile,
                score: tileStrength(tile) + (tile.left === tile.right ? 50 : 0) + (side === 'left' ? 1 : 0),
            });
        });
    });

    options.sort((a, b) => b.score - a.score);
    return options[0] || null;
}

function removeTileFromHand(hand, index) {
    return hand.splice(index, 1)[0];
}

function checkRoundEnd() {
    const match = state.match;
    const humanEmpty = match.humanHand.length === 0;
    const computerEmpty = match.computerHand.length === 0;
    if (humanEmpty || computerEmpty) {
        const winner = humanEmpty ? 'human' : 'computer';
        finishRound(winner, 'hand-empty');
        return true;
    }

    if (!match.boneyard.length && !canPlayAny(match.humanHand) && !canPlayAny(match.computerHand)) {
        const humanPips = handPipCount(match.humanHand);
        const computerPips = handPipCount(match.computerHand);
        if (humanPips === computerPips) {
            match.roundWinner = 'tie';
            match.roundPoints = 0;
            match.message = 'The board is locked and the round ends in a tie. Start the next round.';
            match.phase = 'round-over';
            match.log.unshift(`Board locked: both hands total ${humanPips} pips.`);
        } else {
            finishRound(humanPips < computerPips ? 'human' : 'computer', 'blocked');
        }
        return true;
    }

    return false;
}

function handPipCount(hand) {
    return hand.reduce((sum, tile) => sum + tile.left + tile.right, 0);
}

function scoreRound(losingHand) {
    const pipCount = handPipCount(losingHand);
    return pipCount;
}

function finishRound(winner, reason) {
    const match = state.match;
    const losingHand = winner === 'human' ? match.computerHand : match.humanHand;
    const remainingPips = handPipCount(losingHand);
    const points = reason === 'blocked' ? remainingPips : scoreRound(losingHand);

    if (winner === 'human') {
        match.humanScore += points;
    } else {
        match.computerScore += points;
    }

    if (reason !== 'blocked' && (match.humanScore >= WIN_SCORE || match.computerScore >= WIN_SCORE)) {
        if (winner === 'human') {
            match.humanScore += remainingPips;
        } else {
            match.computerScore += remainingPips;
        }
    }

    match.roundWinner = winner;
    match.roundPoints = points;
    match.phase = 'round-over';
    const playerLabel = winner === 'human' ? 'You' : 'Computer';
    if (reason === 'blocked') {
        match.message = `${playerLabel} won the locked board and took ${points} points from the opponent's hand.`;
        match.log.unshift(`${playerLabel} won the locked board and took ${points} points from the opponent's hand.`);
    } else {
        match.message = `${playerLabel} won the round for ${points} points.`;
        match.log.unshift(`${playerLabel} won the round (${reason}) and scored ${points} points.`);
    }

    if (match.humanScore >= WIN_SCORE || match.computerScore >= WIN_SCORE) {
        match.winner = match.humanScore >= WIN_SCORE ? 'human' : 'computer';
        match.phase = 'match-over';
        match.message = `${match.winner === 'human' ? 'You' : 'Computer'} reached ${WIN_SCORE} points and won the match.`;
        match.log.unshift(`${match.winner === 'human' ? 'You' : 'Computer'} won the match.`);
    }

    saveMatch();
    render();
}

function beginNextRound() {
    const match = state.match;
    match.round += 1;
    match.humanHand = [];
    match.computerHand = [];
    match.boneyard = [];
    match.board = [];
    match.boardEnds = null;
    match.spinnerValue = null;
    match.spinnerAnchoredLeft = false;
    match.spinnerAnchoredRight = false;
    match.spinnerBranches = { up: [], right: [], down: [], left: [] };
    match.turn = 'human';
    match.phase = 'dealing';
    match.winner = null;
    match.roundWinner = null;
    match.roundPoints = 0;
    match.log.unshift(`Starting round ${match.round}.`);

    const deck = createDeck();
    match.humanHand = deck.splice(0, HAND_SIZE);
    match.computerHand = deck.splice(0, HAND_SIZE);
    match.boneyard = deck;
    match.message = 'Dealing a new round...';
    determineOpeningPlayer(match);
    match.phase = 'playing';
    saveMatch();
    render();
    if (match.turn === 'computer') {
        scheduleComputerTurn();
    } else {
        ensurePlayableState();
    }
}

function restartMatch() {
    clearComputerTimer();
    state.match = makeMatch();
    saveMatch();
    render();
    if (state.match.turn === 'computer') scheduleComputerTurn();
}

function playHumanMove(index, side) {
    const match = state.match;
    if (!match || match.turn !== 'human' || match.phase !== 'playing' || match.winner) return;
    const tile = match.humanHand[index];
    if (!tile) return;
    if ((side === 'spinner-up' || side === 'spinner-down') && !spinnerVerticalUnlocked(match)) {
        match.message = 'Up/Down spinner plays unlock only after Left and Right are occupied.';
        saveMatch();
        render();
        return;
    }
    if (!legalPlacements(tile).includes(side)) return;
    if (side !== 'lead' && !isPlacementLegal(match, tile, side, getEnds(match), match.spinnerValue)) {
        match.message = 'That tile does not match the selected side.';
        saveMatch();
        render();
        return;
    }

    if (!placeTile(tile, side)) {
        match.message = 'That tile does not match the selected side.';
        saveMatch();
        render();
        return;
    }
    const played = removeTileFromHand(match.humanHand, index);
    const points = awardMovePoints('human');
    if (match.winner) {
        saveMatch();
        render();
        return;
    }
    const locationLabel = side.startsWith('spinner-') ? `the spinner ${side.replace('spinner-', '')} arm` : side === 'lead' ? 'the lead spot' : `the ${side} end`;
    match.log.unshift(`You played ${formatTile(played)} on ${locationLabel}.`);
    match.message = points ? `You scored ${points}. Computer is thinking...` : 'Computer is thinking...';
    match.turn = 'computer';
    saveMatch();
    render();

    if (!checkRoundEnd()) {
        scheduleComputerTurn();
    }
}

function playComputerTurn() {
    const match = state.match;
    if (!match || match.turn !== 'computer' || match.phase !== 'playing' || match.winner) return;
    normalizeMatchForCurrentRules(match);

    if (!match.board.length) {
        const opening = highestOpeningTile(match.computerHand) || chooseComputerMove();
        if (opening) {
            const openingIndex = match.computerHand.findIndex(tile => tile.id === opening.tile.id);
            if (openingIndex >= 0) {
                const played = match.computerHand[openingIndex];
                if (!placeTile(played, 'lead')) {
                    match.turn = 'human';
                    match.message = 'Your turn.';
                    saveMatch();
                    render();
                    if (!checkRoundEnd()) ensurePlayableState();
                    return;
                }
                removeTileFromHand(match.computerHand, openingIndex);
                const points = awardMovePoints('computer');
                if (match.winner) {
                    saveMatch();
                    render();
                    return;
                }
                match.log.unshift(`Computer opened with ${formatTile(played)}.`);
                match.turn = 'human';
                match.message = points ? `Computer scored ${points}. Your turn.` : 'Your turn.';
                saveMatch();
                render();
                if (!checkRoundEnd()) ensurePlayableState();
                return;
            }
        }
    }

    if (!canPlayAny(match.computerHand) && !drawUntilPlayable('computer')) {
        match.turn = 'human';
        match.message = 'Your turn.';
        saveMatch();
        render();
        if (!checkRoundEnd()) ensurePlayableState();
        return;
    }

    const choice = chooseComputerMove();
    if (!choice) {
        match.turn = 'human';
        match.message = 'Your turn.';
        saveMatch();
        render();
        if (!checkRoundEnd()) ensurePlayableState();
        return;
    }

    const played = match.computerHand[choice.index];
    if (!isPlacementLegal(match, played, choice.side, getEnds(match), match.spinnerValue)) {
        match.turn = 'human';
        match.message = 'Your turn.';
        saveMatch();
        render();
        if (!checkRoundEnd()) ensurePlayableState();
        return;
    }
    if (!placeTile(played, choice.side)) {
        match.turn = 'human';
        match.message = 'Your turn.';
        saveMatch();
        render();
        if (!checkRoundEnd()) ensurePlayableState();
        return;
    }
    removeTileFromHand(match.computerHand, choice.index);
    const points = awardMovePoints('computer');
    if (match.winner) {
        saveMatch();
        render();
        return;
    }
    const computerLocation = choice.side.startsWith('spinner-') ? `the spinner ${choice.side.replace('spinner-', '')} arm` : `the ${choice.side}`;
    match.log.unshift(`Computer played ${formatTile(played)} on ${computerLocation}.`);
    match.turn = 'human';
    match.message = points ? `Computer scored ${points}. Your turn.` : 'Your turn.';
    saveMatch();
    render();
    if (!checkRoundEnd()) ensurePlayableState();
}

function leadIfNeeded() {
    const match = state.match;
    if (!match.board.length) {
        match.message = 'The first legal tile becomes the lead tile.';
    }
}

function boardTileScale(match = state.match) {
    if (!match) return 1;
    ensureSpinnerBranches(match);
    const branchCount = SPINNER_SIDES.reduce((sum, side) => sum + match.spinnerBranches[side].length, 0);
    const playedCount = match.board.length + branchCount;

    let densityScale = 1;
    if (playedCount > 30) densityScale = 0.62;
    else if (playedCount > 24) densityScale = 0.7;
    else if (playedCount > 18) densityScale = 0.8;
    else if (playedCount > 12) densityScale = 0.9;

    const viewportScale = Math.min(
        1,
        window.innerWidth / 1400,
        window.innerHeight / 900,
    );

    return Math.max(0.55, Math.min(1, densityScale * viewportScale));
}

function applyBoardTileScale(boardArea, scale) {
    boardArea.style.setProperty('--board-tile-scale', scale.toFixed(3));
}

function fitBoardToViewport(match = state.match) {
    const boardArea = document.getElementById('boardArea');
    const boardStage = boardArea?.querySelector('.board-stage');
    const boardTrack = boardArea?.querySelector('.board-track');
    if (!boardArea || !boardStage || !boardTrack) return;

    const availableHeight = Math.max(150, window.innerHeight - boardArea.getBoundingClientRect().top - 56);
    boardArea.style.maxHeight = `${availableHeight}px`;

    let scale = boardTileScale(match);
    for (let attempt = 0; attempt < 12; attempt += 1) {
        applyBoardTileScale(boardArea, scale);

        const widthRatio = (boardStage.clientWidth - 12) / Math.max(1, boardTrack.scrollWidth);
        const heightRatio = (availableHeight - 12) / Math.max(1, boardStage.scrollHeight);
        const fitRatio = Math.min(1, widthRatio, heightRatio);

        if (fitRatio >= 1) break;

        const nextScale = Math.max(0.25, scale * fitRatio * 0.94);
        if (Math.abs(nextScale - scale) < 0.01) {
            scale = nextScale;
            applyBoardTileScale(boardArea, scale);
            break;
        }
        scale = nextScale;
    }
}

function renderBoard() {
    const boardArea = document.getElementById('boardArea');
    const match = state.match;
    normalizeMatchForCurrentRules(match);
    ensureSpinnerBranches(match);
    applyBoardTileScale(boardArea, boardTileScale(match));
    const spinnerCenter = match.spinnerValue !== null
        ? { left: match.spinnerValue, right: match.spinnerValue, id: `spinner-${match.spinnerValue}` }
        : null;
    const boardTiles = match.board.map(tile => ({
        tile,
        horizontal: tile.horizontal !== undefined ? tile.horizontal : shouldRenderHorizontal(tile),
        labelPrefix: 'Domino',
    }));
    const spinnerHistoryTiles = !spinnerCenter
        ? []
        : match.spinnerAnchoredLeft
            ? boardTiles.slice(0, -1)
            : match.spinnerAnchoredRight
                ? boardTiles.slice(1)
                : [];
    const spinnerBranchMarkup = side => match.spinnerBranches[side].map(tile => {
        const horizontal = tile.horizontal !== undefined ? tile.horizontal : spinnerTileHorizontal(side, tile);
        return `<div class="domino ${horizontal ? 'domino-horizontal' : ''}" aria-label="Spinner ${side} ${formatTile(tile)}"><div class="domino-half">${pipMarkup(tile.left)}</div><div class="domino-half">${pipMarkup(tile.right)}</div></div>`;
    }).join('');
    const spinnerHistoryMarkup = spinnerHistoryTiles.map(({ tile, horizontal, labelPrefix }) =>
        `<div class="domino spinner-history-domino ${horizontal ? 'domino-horizontal' : ''}" aria-label="${labelPrefix} ${formatTile(tile)}"><div class="domino-half">${pipMarkup(tile.left)}</div><div class="domino-half">${pipMarkup(tile.right)}</div></div>`
    ).join('');
    if (!match.board.length) {
        boardArea.innerHTML = `
            <div class="board-stage">
                <div class="board-empty">
                    The table is empty. Play the first legal tile to start the round.
                </div>
            </div>
        `;
        return;
    }

    boardArea.innerHTML = `
        <div class="board-stage">
            <div class="board-ends">
                <div class="end-chip">Left end: <strong>${match.boardEnds.left}</strong></div>
                <div class="end-chip">Right end: <strong>${match.boardEnds.right}</strong></div>
                ${match.spinnerValue !== null ? `<div class="end-chip">Spinner: <strong>${match.spinnerValue}</strong></div>` : ''}
                <div class="end-chip">Ends total: <strong>${exposedPipTotal(match)}</strong></div>
            </div>
            ${spinnerCenter ? `
                <div class="board-track board-track-spinner">
                    <div class="spinner-layout">
                        ${spinnerHistoryMarkup ? `
                            <div class="spinner-history spinner-history-left" aria-label="Pre-spinner history">
                                ${spinnerHistoryMarkup}
                            </div>
                        ` : ''}
                        <div class="spinner-cross">
                            <div class="spinner-arm spinner-arm-up">${spinnerBranchMarkup('up')}</div>
                            <div class="spinner-arm spinner-arm-left">${spinnerBranchMarkup('left')}</div>
                            <div class="spinner-center"><div class="domino" aria-label="Spinner center ${formatTile(spinnerCenter)}"><div class="domino-half">${pipMarkup(spinnerCenter.left)}</div><div class="domino-half">${pipMarkup(spinnerCenter.right)}</div></div></div>
                            <div class="spinner-arm spinner-arm-right">${spinnerBranchMarkup('right')}</div>
                            <div class="spinner-arm spinner-arm-down">${spinnerBranchMarkup('down')}</div>
                        </div>
                    </div>
                </div>
            ` : `
                <div class="board-track">
                    ${boardTiles.map(({ tile, horizontal, labelPrefix }) =>
                        `<div class="domino ${horizontal ? 'domino-horizontal' : ''}" aria-label="${labelPrefix} ${formatTile(tile)}"><div class="domino-half">${pipMarkup(tile.left)}</div><div class="domino-half">${pipMarkup(tile.right)}</div></div>`
                    ).join('')}
                </div>
            `}
        </div>
    `;
    fitBoardToViewport(match);
}

function renderHand() {
    const handArea = document.getElementById('handArea');
    const match = state.match;
    const playable = match.turn === 'human' && match.phase === 'playing' && !match.winner;

    const buttonLabel = side => {
        if (side === 'lead') return 'Play Lead';
        if (side === 'left') return 'Play Left';
        if (side === 'right') return 'Play Right';
        if (side.startsWith('spinner-')) return `Spinner ${side.replace('spinner-', '').toUpperCase()}`;
        return 'Play Spinner';
    };

    handArea.innerHTML = match.humanHand.map((tile, index) => {
        const ends = getEnds(match);
        const placements = playable
            ? legalPlacements(tile)
                .filter(side => isPlacementLegal(match, tile, side, ends, match.spinnerValue))
            : [];
        const isPlayable = placements.length > 0;
        const buttonMarkup = !playable || !isPlayable
            ? `<button class="btn btn-secondary btn-small" disabled>${match.board.length ? 'Blocked' : 'Lead Tile'}</button>`
            : placements
                .map(side => `<button class="btn ${side === 'left' || side === 'lead' ? 'btn-success' : 'btn-primary'} btn-small" data-tile-index="${index}" data-side="${side}">${buttonLabel(side)}</button>`)
                .join('');

        return `
            <div class="tile-card ${playable && isPlayable ? '' : 'disabled'}">
                <div class="domino mini-domino" aria-label="Domino ${formatTile(tile)}">
                    <div class="domino-half">${pipMarkup(tile.left)}</div>
                    <div class="domino-half">${pipMarkup(tile.right)}</div>
                </div>
                <div class="tile-label">${formatTile(tile)}</div>
                <div class="tile-actions">${buttonMarkup}</div>
            </div>
        `;
    }).join('');

    handArea.querySelectorAll('[data-tile-index]').forEach(button => {
        button.addEventListener('click', event => {
            const target = event.currentTarget;
            playHumanMove(Number(target.dataset.tileIndex), target.dataset.side);
        });
    });
}

function renderLog() {
    const logArea = document.getElementById('logArea');
    const entries = state.match.log.slice(0, 12);
    logArea.innerHTML = entries.map(entry => `<div class="log-item">${escapeHtml(entry)}</div>`).join('') || '<div class="log-item">No moves yet.</div>';
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function render() {
    const match = state.match;
    document.getElementById('humanScore').textContent = match.humanScore;
    document.getElementById('computerScore').textContent = match.computerScore;
    document.getElementById('roundNumber').textContent = match.round;
    document.getElementById('turnLabel').textContent = match.message;
    document.getElementById('boneyardCount').textContent = match.boneyard.length;
    document.getElementById('humanHandCount').textContent = `${match.humanHand.length} tiles`;
    document.getElementById('computerHandCount').textContent = `${match.computerHand.length} tiles`;
    document.getElementById('nextRoundBtn').disabled = match.phase !== 'round-over' && match.phase !== 'match-over' && match.winner !== 'human' && match.winner !== 'computer';

    if (match.phase === 'match-over') {
        document.getElementById('nextRoundBtn').textContent = 'Match Complete';
    } else {
        document.getElementById('nextRoundBtn').textContent = 'Next Round';
    }

    renderBoard();
    renderHand();
    renderLog();
}

function ensurePlayableState() {
    const match = state.match;
    if (!match || match.phase !== 'playing' || match.winner) return;

    if (match.turn === 'human' && !canPlayAny(match.humanHand)) {
        if (drawUntilPlayable('human')) {
            match.turn = 'human';
            match.message = 'You have a playable tile now.';
            saveMatch();
            render();
            return;
        }
        if (checkRoundEnd()) {
            return;
        }
    }

    if (match.turn === 'computer' && !canPlayAny(match.computerHand)) {
        if (drawUntilPlayable('computer')) {
            scheduleComputerTurn();
            return;
        }
        if (checkRoundEnd()) {
            return;
        }
        match.turn = 'human';
        match.message = 'Your turn.';
        saveMatch();
        render();
    }
}

function restoreOrStart() {
    const saved = loadMatch();
    if (saved && saved.humanHand && saved.computerHand && saved.board && typeof saved.humanScore === 'number') {
        ensureSpinnerBranches(saved);
        normalizeMatchForCurrentRules(saved);
        state.match = saved;
        showResumeModal();
        return;
    }

    state.match = makeMatch();
    saveMatch();
    render();
    if (state.match.turn === 'computer') {
        scheduleComputerTurn();
    } else {
        ensurePlayableState();
    }
}

function showResumeModal() {
    const modal = document.getElementById('modal');
    modal.classList.remove('hidden');
}

function hideResumeModal() {
    document.getElementById('modal').classList.add('hidden');
}

document.getElementById('resumeBtn').addEventListener('click', () => {
    hideResumeModal();
    render();
    ensurePlayableState();
    if (state.match.turn === 'computer' && state.match.phase === 'playing') {
        scheduleComputerTurn();
    }
});

document.getElementById('discardBtn').addEventListener('click', () => {
    hideResumeModal();
    state.match = makeMatch();
    saveMatch();
    render();
    if (state.match.turn === 'computer') {
        scheduleComputerTurn();
    } else {
        ensurePlayableState();
    }
});

document.getElementById('newMatchBtn').addEventListener('click', () => {
    restartMatch();
});

document.getElementById('nextRoundBtn').addEventListener('click', () => {
    if (state.match.phase === 'round-over' || state.match.phase === 'match-over') {
        if (state.match.phase === 'match-over') {
            restartMatch();
            return;
        }
        beginNextRound();
    }
});

window.addEventListener('beforeunload', saveMatch);

window.addEventListener('resize', () => {
    if (state.match) render();
});

restoreOrStart();