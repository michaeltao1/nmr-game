// Leaderboard players: pilot testers who played both sets solo and agreed to share their scores
// under a nickname. Each has their result on every question of a set, in config.js order:
// correct (1 or 0) and seconds (0 to 99).
//
// status "demo": the players below are made up, and the leaderboard round shows a yellow banner.
// After the pilot, build_leaderboard.py replaces this file with the testers' results and status "pilot".
window.LEADERBOARD = {
  status: "demo",
  sets: {
    A: [
      { name: "Demo 1", correct: [1, 1, 1, 0, 1, 1, 1, 1, 1, 1], seconds: [10, 35, 20, 18, 26, 8, 26, 23, 19, 22] },
      { name: "Demo 2", correct: [0, 1, 1, 0, 1, 1, 1, 0, 1, 0], seconds: [7, 18, 13, 14, 21, 7, 18, 15, 11, 13] },
      { name: "Demo 3", correct: [1, 0, 0, 0, 1, 1, 1, 1, 0, 1], seconds: [8, 20, 17, 13, 20, 10, 19, 19, 14, 22] },
      { name: "Demo 4", correct: [1, 1, 0, 0, 0, 1, 0, 0, 1, 1], seconds: [7, 26, 11, 18, 18, 9, 25, 11, 17, 15] },
      { name: "Demo 5", correct: [1, 1, 0, 0, 0, 1, 0, 0, 0, 0], seconds: [9, 31, 17, 16, 19, 10, 31, 21, 12, 21] },
      { name: "Demo 6", correct: [0, 1, 0, 0, 1, 1, 0, 1, 1, 0], seconds: [9, 32, 18, 17, 26, 12, 31, 17, 15, 23] },
      { name: "Demo 7", correct: [1, 0, 1, 0, 1, 1, 1, 1, 1, 0], seconds: [7, 20, 13, 16, 11, 5, 17, 12, 9, 13] },
      { name: "Demo 8", correct: [1, 0, 1, 0, 1, 1, 0, 0, 0, 1], seconds: [10, 32, 16, 23, 20, 12, 30, 14, 19, 19] }
    ],
    B: [
      { name: "Demo 1", correct: [1, 0, 0, 0, 0, 1, 0, 1, 0, 1], seconds: [16, 37, 17, 25, 29, 11, 37, 20, 29, 27] },
      { name: "Demo 2", correct: [1, 0, 0, 1, 1, 1, 1, 1, 1, 1], seconds: [11, 24, 18, 22, 28, 13, 35, 16, 24, 16] },
      { name: "Demo 3", correct: [1, 0, 1, 1, 0, 1, 1, 0, 1, 0], seconds: [8, 37, 17, 26, 28, 10, 31, 16, 26, 23] },
      { name: "Demo 4", correct: [1, 0, 0, 1, 0, 1, 0, 1, 0, 1], seconds: [14, 24, 15, 17, 29, 9, 25, 24, 26, 17] },
      { name: "Demo 5", correct: [1, 0, 1, 1, 0, 0, 1, 1, 1, 0], seconds: [8, 34, 19, 16, 19, 13, 27, 18, 16, 25] },
      { name: "Demo 6", correct: [1, 1, 0, 0, 1, 0, 1, 1, 0, 1], seconds: [12, 23, 17, 17, 25, 8, 21, 19, 18, 24] },
      { name: "Demo 7", correct: [1, 1, 0, 1, 1, 1, 1, 1, 1, 1], seconds: [10, 33, 23, 25, 21, 13, 30, 16, 31, 26] },
      { name: "Demo 8", correct: [0, 0, 0, 1, 0, 1, 0, 0, 0, 1], seconds: [8, 20, 16, 15, 14, 7, 15, 9, 13, 21] }
    ]
  }
};
