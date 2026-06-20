# Dominoes – Jailhouse Rules

An interactive browser-based dominoes game: **you vs. the computer**, played under **jailhouse rules**.

## How to play

Open `index.html` in any modern web browser — no build step or server required.

## Jailhouse rules

| Rule | Detail |
|---|---|
| **Must play** | You *must* place a tile if you are able to. |
| **Draw** | If you cannot play, draw from the boneyard one tile at a time until you can play or the boneyard runs out. |
| **Pass** | You may only pass when the boneyard is empty *and* you have no playable tile. |
| **Going out** | When a player plays their last tile they score the opponent's remaining pip total, rounded down to the nearest multiple of 5 with a minimum score of 5. |
| **Blocked board** | If both players pass consecutively the player with fewer pips in hand wins and scores the opponent's pip total, rounded down to the nearest multiple of 5 with a minimum score of 5. If equal, no points are awarded. |
| **Round goal** | First player to reach **250 points** wins the round. |
| **Multiple rounds** | Any number of rounds may be played — scores reset after each round. |

## Game features

- Authentic pip-dot tile rendering
- Computer AI (sheds doubles first, then highest-pip tiles)
- Click-to-place board targets with live preview of the selected tile
- Animated highlighting for playable tiles and end-choice buttons
- Responsive layout (works on mobile)
