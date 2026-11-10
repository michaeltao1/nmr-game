// Which 10 questions make up each set, in order: spectrum 1 steps 1 to 5, then spectrum 2 steps 1 to 5.
// Each round sent to the results sheet lists its answers in this order.
//
// To swap in the spare spectrum, replace the five IDs of the faulty spectrum in BOTH sets:
// A3-1 ... A3-5 in set A and B3-1 ... B3-5 in set B, in the same position, so the sets stay matched.
//
// resultsUrl: the web app URL of the Google Sheet script (results_sheet.gs), ending in /exec.
// It deals each student's order of rounds and receives every finished leaderboard or solo round
// for the "NMR game results" sheet; practice rounds are never sent. If it is empty, rounds can't
// be recorded.
//
// formUrl and formNameField: the questionnaire (a Google Form) that opens after round 2 with the
// student's game name already filled in. formUrl is the form's link ending in /viewform, and
// formNameField is the entry number of its game name question, both taken from the form's
// pre-filled link (...viewform?usp=pp_url&entry.123456789=GAMENAME). Until both are set, the game
// just thanks students at the end and shows their game name.
//
// infoUrl (optional): a link to the participant information sheet, shown under the consent box.
window.GAME_CONFIG = {
  sets: {
    A: ["A1-1", "A1-2", "A1-3", "A1-4", "A1-5", "A2-1", "A2-2", "A2-3", "A2-4", "A2-5"],
    B: ["B1-1", "B1-2", "B1-3", "B1-4", "B1-5", "B2-1", "B2-2", "B2-3", "B2-4", "B2-5"]
  },
  resultsUrl: "https://script.google.com/macros/s/AKfycbyQIjdIeH-1ewbYMcjGx4bLyBgRmkH59LC4paS3XtY4JwLUZwtGhlRPtCRAnhpQADyp0g/exec",
  formUrl: "https://docs.google.com/forms/d/e/1FAIpQLSc5SJLvspOnF7U3t_FVmfwzoILozLPgst-Jh5ODZKEgv9vkqw/viewform",
  formNameField: "entry.451206385",
  infoUrl: ""
};
