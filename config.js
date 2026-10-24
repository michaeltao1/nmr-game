// Which 10 questions make up each set, in order: spectrum 1 steps 1 to 5, then spectrum 2 steps 1 to 5.
// The end-of-round code records answers in this order.
//
// To swap in the spare spectrum, replace the five IDs of the faulty spectrum in BOTH sets:
// A3-1 ... A3-5 in set A and B3-1 ... B3-5 in set B, in the same position, so the sets stay matched.
//
// resultsUrl: the web app URL of the Google Sheet script (results_sheet.gs), ending in /exec.
// While it is empty, the game sends nothing anywhere. Once it is set, every finished leaderboard
// or solo round adds itself to the sheet; practice rounds are never sent.
window.GAME_CONFIG = {
  sets: {
    A: ["A1-1", "A1-2", "A1-3", "A1-4", "A1-5", "A2-1", "A2-2", "A2-3", "A2-4", "A2-5"],
    B: ["B1-1", "B1-2", "B1-3", "B1-4", "B1-5", "B2-1", "B2-2", "B2-3", "B2-4", "B2-5"]
  },
  resultsUrl: ""
};
