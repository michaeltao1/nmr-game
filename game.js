/* NMR practice game: screens, timing, leaderboard and saving each round to the results sheet.
   Plain JavaScript with no libraries.

   The study link (no set or mode in it) runs a whole session: the student picks a game name and
   agrees to take part, the results sheet deals them one of four orders (which set goes with the
   leaderboard, and which round type comes first), and they play round 1 then round 2. Each
   finished round goes to the Google Sheet named in config.js with the game name, and the
   questionnaire (a Google Form) opens at the end with that name already filled in, so the two
   can be matched. The session is kept in this tab only (sessionStorage), so a refresh carries on
   where it stopped.

   A link with a set and mode (?set=A&mode=L) plays one round on its own, for testing, and stores
   nothing; ?mode=P is practice, which is never sent. The game resends a round until the sheet
   replies "ok", and the sheet keeps a resent round only once. */
(function () {
  "use strict";

  var ITEMS = window.ITEMS || {};
  var CONFIG = window.GAME_CONFIG || { sets: {} };
  var BOARD = window.LEADERBOARD || { status: "demo", sets: {} };

  var POINTS = 10;          // per correct answer
  var CAP = 99;             // seconds per question, so each time fits two digits
  var FALLBACK_MS = 4000;   // start the clock anyway if a spectrum is slow to load
  var LETTERS = ["A", "B", "C", "D"];
  var NUMBERS = ["zero", "one", "two", "three", "four"];
  var DIGITS36 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  var SVGNS = "http://www.w3.org/2000/svg";
  function svg(tag, attrs) {
    var e = document.createElementNS(SVGNS, tag);
    Object.keys(attrs || {}).forEach(function (k) { e.setAttribute(k, attrs[k]); });
    return e;
  }
  var REDUCED = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);

  // Formulas arrive with Unicode subscripts and superscripts (C₇H₁₄O₂, ¹³C). Typeset them as real
  // <sub> and <sup> so they match the body font instead of falling back to another one.
  var SCRIPTS = /[₀-₉]+|[¹²³⁰⁴-⁹]+/g;
  function digit(c) {
    var n = c.charCodeAt(0);
    if (n >= 0x2080) return String(n - 0x2080);
    return { "¹": "1", "²": "2", "³": "3" }[c] || String(n - 0x2070);
  }
  function setChem(node, text) {
    node.textContent = "";
    var last = 0, m;
    SCRIPTS.lastIndex = 0;
    while ((m = SCRIPTS.exec(text))) {
      if (m.index > last) node.appendChild(document.createTextNode(text.slice(last, m.index)));
      var low = m[0].charCodeAt(0) >= 0x2080;
      node.appendChild(el(low ? "sub" : "sup", null, m[0].replace(/./g, digit)));
      last = SCRIPTS.lastIndex;
    }
    if (last < text.length) node.appendChild(document.createTextNode(text.slice(last)));
    return node;
  }

  // A Lorentzian line in a 40 x 32 box with its baseline along the bottom: one peak of the ruler.
  var PEAK = (function () {
    var d = "M0 32", g = 3.6;
    for (var i = 0; i <= 48; i++) {
      var x = i * 40 / 48;
      d += " L" + x.toFixed(2) + " " + (32 - 30 * g * g / ((x - 20) * (x - 20) + g * g)).toFixed(2);
    }
    return d + " L40 32";
  })();
  // A benzene-ring hexagon (pointy top) for the answer letters.
  var HEX = "M17 1.6 L32.2 10.3 L32.2 27.7 L17 36.4 L1.8 27.7 L1.8 10.3 Z";

  function sum(a) { return a.reduce(function (s, v) { return s + v; }, 0); }
  function mmss(s) { return Math.floor(s / 60) + ":" + ("0" + (s % 60)).slice(-2); }
  function ordinal(n) {
    var t = n % 100, u = n % 10;
    var suffix = (t >= 11 && t <= 13) ? "th" : u === 1 ? "st" : u === 2 ? "nd" : u === 3 ? "rd" : "th";
    return n + suffix;
  }

  /* ---------- The link: the study link (no set or mode), ?set=A&mode=L, ?mode=P ---------- */
  var params = new URLSearchParams(window.location.search);
  var STUDY = !params.has("set") && !params.has("mode");
  var mode = (params.get("mode") || "").trim().toUpperCase();
  var set = (params.get("set") || "").trim().toUpperCase();
  // Optional, passed on to the results sheet: a participant ID (one-round links only) and a
  // source label (src=pilot for the pilot, src=test for tries; the study link means main).
  function linkId(name, max) {
    var v = (params.get(name) || "").trim();
    return new RegExp("^[A-Za-z0-9_-]{1," + max + "}$").test(v) ? v : "";
  }
  var pid = linkId("pid", 64);
  var src = linkId("src", 32) || (STUDY ? "main" : "");

  // The four orders. Each set goes with the leaderboard for half the students, and half of them
  // play the leaderboard round first, so neither the set nor practice can pass for a leaderboard effect.
  var ORDERS = {
    1: [["A", "L"], ["B", "S"]],
    2: [["B", "L"], ["A", "S"]],
    3: [["A", "S"], ["B", "L"]],
    4: [["B", "S"], ["A", "L"]]
  };
  // Game names: 2 to 24 characters starting with a letter (the results sheet uses the same rule).
  var NAME_RULE = /^\p{L}[\p{L}\p{N} '’._-]{1,23}$/u;
  var SID_RULE = /^[A-Za-z][A-Za-z0-9]{7,31}$/;
  var SIGNUP_TIMEOUT_MS = 10000;   // no answer from the sheet by then: pick the order here instead
  var STORE = "nmr-study";

  // Where finished rounds go: the Google Apps Script web app behind the results sheet.
  var SHEET = /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/;
  var sheetUrl = SHEET.test(CONFIG.resultsUrl || "") ? CONFIG.resultsUrl : "";
  var SAVE_TIMEOUT_MS = 15000;                // a try with no reply by then counts as failed
  var RETRY_DELAYS_MS = [2000, 5000, 10000];  // waits before the second, third and fourth tries

  // The questionnaire: a Google Form that opens after round 2 with the game name filled in.
  var FORM = /^https:\/\/docs\.google\.com\/forms\/d\/(e\/)?[A-Za-z0-9_-]+\/viewform$/;
  var formUrl = FORM.test(CONFIG.formUrl || "") && /^entry\.\d+$/.test(CONFIG.formNameField || "") ? CONFIG.formUrl : "";
  var infoUrl = /^https:\/\/[^\s"'<>]+$/.test(CONFIG.infoUrl || "") ? CONFIG.infoUrl : "";

  function pickQuestions() {
    var sets = CONFIG.sets || {};
    var ids = null;
    if ((mode === "L" || mode === "S") && (set === "A" || set === "B")) ids = sets[set];
    if (mode === "P") {
      if (set === "A" || set === "B") ids = sets[set];
      else if (set === "") ids = (sets.A || []).concat(sets.B || []);
    }
    if (!ids || !ids.length || ids.length % 5) return null;
    if (mode !== "P" && ids.length !== 10) return null;
    var qs = ids.map(function (id) { return ITEMS[id]; });
    return qs.every(Boolean) ? qs : null;
  }

  var questions, timed, testers;
  function useRound(s, m) {
    set = s;
    mode = m;
    questions = pickQuestions();
    timed = mode === "L" || mode === "S";
    testers = (BOARD.sets && BOARD.sets[set]) || [];
  }
  useRound(set, mode);
  var NAME_OK = /^[A-Za-z0-9 '_-]{1,12}$/;

  /* ---------- The study session, kept in this tab so a refresh carries on where it stopped ---------- */
  var study = null;   // { name, sid, src, group, round, progress: { roundId, correct, seconds } }

  function cleanName(v) { return String(v == null ? "" : v).replace(/\s+/g, " ").trim(); }

  function validStudy(s) {
    if (!s || typeof s !== "object") return false;
    if (!NAME_RULE.test(s.name || "") || !SID_RULE.test(s.sid || "") || [1, 2, 3, 4].indexOf(s.group) < 0 ||
        (s.round !== 1 && s.round !== 2) || !/^[A-Za-z0-9_-]{1,32}$/.test(s.src || "")) return false;
    var p = s.progress;
    if (p == null) return true;
    return /^[A-Za-z0-9-]{8,64}$/.test(p.roundId || "") && Array.isArray(p.correct) && Array.isArray(p.seconds) &&
      p.correct.length === p.seconds.length && p.correct.length <= 10 &&
      p.correct.every(function (v) { return v === 0 || v === 1; }) &&
      p.seconds.every(function (v) { return v === Math.floor(v) && v >= 0 && v <= CAP; });
  }

  function loadStudy() {
    try {
      var s = JSON.parse(window.sessionStorage.getItem(STORE) || "null");
      return validStudy(s) ? s : null;
    } catch (e) { return null; }
  }

  function keepStudy() {
    try { window.sessionStorage.setItem(STORE, JSON.stringify(study)); } catch (e) { /* no storage: a refresh starts again */ }
  }

  function randomInt(n) {
    if (window.crypto && crypto.getRandomValues) {
      var a = new Uint32Array(1);
      crypto.getRandomValues(a);
      return a[0] % n;
    }
    return Math.floor(Math.random() * n);
  }

  // A session ID for one sign-up: a letter, then nine letters or digits (no look-alikes).
  function newSid() {
    var letters = "ABCDEFGHJKMNPQRSTUVWXYZ", all = letters + "23456789";
    var s = letters.charAt(randomInt(letters.length));
    for (var i = 0; i < 9; i++) s += all.charAt(randomInt(all.length));
    return s;
  }

  /* ---------- Round state ---------- */
  var state;
  var token = 0;           // which question the current load/fallback callbacks belong to
  var fallbackTimer = null;

  function freshState() {
    return {
      i: 0, score: 0, correct: [], seconds: [], ranks: [],
      waiting: false, running: false, t0: 0,
      guard: false        // ask before closing the tab
    };
  }

  function show(name) {
    ["start", "play", "result", "broken"].forEach(function (n) {
      $("screen-" + n).hidden = n !== name;
    });
    window.scrollTo(0, 0);
  }

  /* ---------- Sign-up (study link): game name and consent, then the sheet deals the order ---------- */
  function showSignup() {
    $("signup-block").hidden = false;
    $("round-block").hidden = true;
    $("demo-banner").hidden = BOARD.status === "pilot";
    $("info-line").hidden = !infoUrl;
    if (infoUrl) $("info-link").href = infoUrl;
    show("start");
  }

  function signupError(text, field) {
    $("signup-error").textContent = text;
    $("signup-error").hidden = !text;
    $("name").setAttribute("aria-invalid", field === $("name") ? "true" : "false");
    if (field) field.focus();
  }

  var signing = false;
  function signUp(ev) {
    ev.preventDefault();
    if (signing) return;
    var input = $("name"), name = cleanName(input.value);
    input.value = name;
    var nameRule = "Use 2 to 24 characters and start with a letter. Letters, numbers, spaces, hyphens and apostrophes are fine.";
    if (!name) return signupError("Please choose a game name.", input);
    if (!NAME_RULE.test(name)) return signupError(nameRule, input);
    if (!$("consent").checked) return signupError("Please tick the box to agree before you start.", $("consent"));
    signupError("");
    signing = true;
    $("btn-signup").disabled = true;
    $("btn-signup").textContent = "Setting up your rounds…";
    var sid = newSid();
    askForOrder(name, sid, function (reply) {
      signing = false;
      $("btn-signup").disabled = false;
      $("btn-signup").textContent = "Continue";
      if (reply === "taken") return signupError("Someone has already picked that name. Please choose another one.", input);
      if (reply === "name") return signupError(nameRule, input);
      study = { name: name, sid: sid, src: src, group: reply, round: 1, progress: null };
      keepStudy();
      enterRound(true);
    });
  }

  // The results sheet deals the order, so the four groups stay the same size, and checks that no
  // one else has the name. If it can't be reached, the game picks one of the four orders at random.
  function askForOrder(name, sid, done) {
    var answered = false, timer = null;
    function reply(r) {
      if (answered) return;
      answered = true;
      clearTimeout(timer);
      done(r);
    }
    function random() { reply(randomInt(4) + 1); }
    if (!sheetUrl) return random();
    timer = setTimeout(random, SIGNUP_TIMEOUT_MS);
    try {
      fetch(sheetUrl, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" },
                        body: JSON.stringify({ v: 1, type: "signup", name: name, sid: sid, src: src }) })
        .then(function (res) { return res.text(); })
        .then(function (text) {
          var d = null;
          try { d = JSON.parse(text); } catch (e) { d = null; }
          if (d && d.ok === true && [1, 2, 3, 4].indexOf(d.group) >= 0) reply(d.group);
          else if (d && (d.reason === "taken" || d.reason === "name")) reply(d.reason);
          else random();
        }, random);
    } catch (e) { random(); }
  }

  // The start screen for the study's current round. A round that was finished but maybe not yet
  // saved (the tab was refreshed) goes straight to its end screen and is sent again.
  function enterRound(moveFocus) {
    var pair = ORDERS[study.group][study.round - 1];
    useRound(pair[0], pair[1]);
    var p = study.progress;
    if (p && p.correct.length === questions.length) {
      roundState();
      state.guard = true;
      finish();
      return;
    }
    setupStart();
    show("start");
    if (moveFocus) $("round-of").focus({ preventScroll: true });
  }

  function toRound2() {
    if (!STUDY || study.round !== 1 || (state.save !== "saved" && state.save !== "off")) return;
    study.round = 2;
    study.progress = null;
    keepStudy();
    enterRound(true);
  }

  /* ---------- Start screen ---------- */
  function setupStart() {
    var n = questions.length, spectra = n / 5;
    var done = STUDY && study.progress ? study.progress.correct.length : 0;
    $("signup-block").hidden = true;
    $("round-block").hidden = false;
    $("round-of").hidden = !STUDY;
    $("playing-as").hidden = !STUDY;
    if (STUDY) {
      $("round-of").textContent = "Round " + study.round + " of 2";
      $("playing-name").textContent = study.name;
    }
    $("round-line").textContent = mode === "L" ? "This round has a leaderboard."
      : mode === "S" ? "This round has no leaderboard."
      : "Practice mode: no leaderboard, and nothing is recorded.";
    $("round-line").className = "round-line " + (mode === "L" ? "leaderboard" : mode === "S" ? "solo" : "practice");
    $("btn-start").textContent = done ? "Carry on" : STUDY ? "Start round " + study.round
      : timed ? "Start the round" : "Start practice";
    $("resume-line").hidden = !done;
    $("resume-line").textContent = done ? "You've answered " + done + " of " + n +
      " questions in this round, so you'll carry on from question " + (done + 1) + "." : "";
    var rules = timed ? [
      "10 questions: two spectra, five steps each, one attempt per question.",
      "10 points per correct answer; the time on each question is recorded.",
      "An explanation appears after each answer.",
      "Tap a spectrum to enlarge it.",
      STUDY ? "Play alone, without notes, and keep this tab open until the end."
        : "Play alone, without notes, and keep this tab open until the end screen says your results are saved."
    ] : [
      n + " questions: " + (NUMBERS[spectra] || spectra) + " spectra, five steps each, one attempt per question.",
      "10 points per correct answer.",
      "An explanation appears after each answer.",
      "Tap a spectrum to enlarge it."
    ];
    var list = $("rules");
    list.textContent = "";
    rules.forEach(function (r) { list.appendChild(el("li", null, r)); });
    $("demo-banner").hidden = !(mode === "L" && BOARD.status !== "pilot");
    // Start loading every spectrum now, so each question appears without delay.
    questions.forEach(function (q) { var im = new Image(); im.src = q.image; });
  }

  // A fresh round. In the study it picks up any answers already given in this round.
  function roundState() {
    state = freshState();
    state.layout = window.matchMedia("(max-width: 899px)").matches ? "phone" : "laptop";
    if (!STUDY) return;
    if (!study.progress) study.progress = { roundId: roundId(), correct: [], seconds: [] };
    var p = study.progress;
    state.roundId = p.roundId;
    state.correct = p.correct.slice();
    state.seconds = p.seconds.slice();
    state.score = POINTS * sum(state.correct);
    state.i = state.correct.length;
    if (mode === "L") {
      for (var k = 0; k <= state.i; k++) state.ranks[k] = standings(k).filter(function (r) { return r.you; })[0].rank;
    }
    keepStudy();
  }

  function begin() {
    roundState();
    state.guard = timed;
    $("layout").classList.toggle("with-board", mode === "L");
    $("lb-panel").hidden = mode !== "L";
    $("lb-strip").hidden = mode !== "L";
    $("lb-inline").hidden = mode !== "L";
    buildRuler($("ruler"), questions.length);
    lastOrder = null;
    show("play");
    if (state.i >= questions.length) finish();
    else renderQuestion();
  }

  /* ---------- The ruler: one slot per question, five per spectrum; answers grow peaks ---------- */
  function buildRuler(box, n) {
    box.textContent = "";
    for (var g = 0; g < n / 5; g++) {
      var group = el("div", "rgroup"), slots = el("div", "slots");
      for (var s = 0; s < 5; s++) {
        var pic = svg("svg", { viewBox: "0 0 40 32", preserveAspectRatio: "none", focusable: "false" });
        pic.appendChild(svg("path", { d: PEAK, "class": "pk", "vector-effect": "non-scaling-stroke" }));
        slots.appendChild(el("span", "slot")).appendChild(pic);
      }
      group.appendChild(slots);
      group.appendChild(el("span", "rlabel", "Spectrum " + (g + 1)));
      box.appendChild(group);
    }
  }

  // Answered slots show a tall (right) or short (wrong) peak; grow = the slot that just changed.
  function paintRuler(box, current, grow) {
    Array.prototype.forEach.call(box.querySelectorAll(".slot"), function (slot, i) {
      var done = i < state.correct.length;
      slot.className = "slot" + (done ? (state.correct[i] ? " good" : " bad") : "") +
        (i === current ? " current" : "") + (i === grow ? " grow" : "");
    });
    Array.prototype.forEach.call(box.querySelectorAll(".rgroup"), function (g, j) {
      g.classList.toggle("now", current >= 0 && Math.floor(current / 5) === j);
    });
  }

  /* ---------- Questions ---------- */
  function renderQuestion() {
    var q = questions[state.i], n = questions.length;
    // The ruler shows which spectrum; the spectrum is also spelt out for screen readers.
    var where = $("where");
    where.textContent = "";
    where.appendChild(el("span", "vh", "Spectrum " + (Math.floor(state.i / 5) + 1) + " of " + (n / 5) + ", "));
    where.appendChild(el("span", "of", "Step " + (state.i % 5 + 1) + " of 5: "));
    where.appendChild(el("span", "name", q.stepName));
    $("score").textContent = String(state.score);
    setChem($("caption"), q.caption);
    setChem($("question"), q.question);
    $("feedback").hidden = true;

    var box = $("answers");
    box.textContent = "";
    box.classList.add("waiting");
    q.options.forEach(function (opt, k) {
      var b = el("button", "answer");
      b.type = "button";
      var letter = el("span", "letter");
      var hex = svg("svg", { viewBox: "0 0 34 38", focusable: "false", "aria-hidden": "true" });
      hex.appendChild(svg("path", { d: HEX, "class": "hex" }));
      letter.appendChild(hex);
      letter.appendChild(el("b", null, LETTERS[k]));
      b.appendChild(letter);
      var t = el("span", "text");
      if (Array.isArray(opt)) {
        t.appendChild(setChem(el("span", "main"), opt[0]));
        t.appendChild(setChem(el("span", "sub"), opt[1]));
      } else {
        setChem(t, opt);
      }
      b.appendChild(t);
      b.addEventListener("click", function () { choose(k, performance.now()); });
      box.appendChild(b);
    });

    // The clock starts when this spectrum has loaded, or after 4 seconds if it is slow.
    state.waiting = true;
    state.running = false;
    var mine = ++token;
    var img = $("spectrum-img");
    img.onload = img.onerror = function () { if (mine === token) startClock(); };
    img.alt = q.alt;
    img.src = q.image;
    clearTimeout(fallbackTimer);
    fallbackTimer = setTimeout(function () { if (mine === token) startClock(); }, FALLBACK_MS);
    if (img.complete && img.naturalWidth) startClock();

    updateProgress();
    updateClock();
    renderBoard();
  }

  function startClock() {
    if (!state.waiting) return;
    state.waiting = false;
    clearTimeout(fallbackTimer);
    state.t0 = performance.now();
    state.running = true;
    $("answers").classList.remove("waiting");
  }

  function choose(k, t) {
    if (!state.running) return;      // taps before the spectrum has loaded are ignored
    state.running = false;
    var q = questions[state.i];
    var secs = Math.min(CAP, Math.round((t - state.t0) / 1000));
    var ok = k === q.correct;
    state.correct.push(ok ? 1 : 0);
    state.seconds.push(secs);
    if (ok) state.score += POINTS;
    if (STUDY) {
      study.progress.correct = state.correct.slice();
      study.progress.seconds = state.seconds.slice();
      keepStudy();
    }

    Array.prototype.forEach.call($("answers").children, function (b, j) {
      b.disabled = true;
      b.classList.add(j === q.correct ? "correct" : j === k ? "wrong" : "faded");
      if (j === k) b.classList.add("picked");
    });
    $("verdict").textContent = ok ? "Correct, +10 points" : "Not this time";
    $("feedback").className = "feedback " + (ok ? "good" : "bad");
    setChem($("explanation"), q.explanation);
    $("btn-next").textContent = state.i === questions.length - 1 ? "See my result" : "Next question";
    $("feedback").hidden = false;
    var score = $("score");
    score.textContent = String(state.score);
    if (ok) { score.classList.remove("bump"); void score.offsetWidth; score.classList.add("bump"); }
    paintRuler($("ruler"), -1, state.i);
    updateClock();
    renderBoard();
    $("btn-next").focus({ preventScroll: true });
    $("feedback").scrollIntoView({ block: "nearest" });
  }

  function next() {
    if ($("screen-play").hidden || $("feedback").hidden) return;
    $("feedback").hidden = true;
    if (state.i < questions.length - 1) {
      state.i += 1;
      renderQuestion();
      window.scrollTo(0, 0);
    } else {
      finish();
    }
  }

  function updateProgress() {
    paintRuler($("ruler"), state.i, -1);
  }

  function updateClock() {
    if (!state || $("screen-play").hidden) return;
    var current = state.running ? Math.min(CAP, Math.floor((performance.now() - state.t0) / 1000)) : 0;
    $("clock").textContent = mmss(sum(state.seconds) + current);
  }

  /* ---------- Leaderboard: replays the pilot testers' results question by question ---------- */
  function standings(k) {
    var rows = testers.map(function (p, j) {
      return {
        key: "t" + j,
        name: NAME_OK.test(p.name || "") ? p.name : "Player " + (j + 1),
        you: false,
        points: POINTS * sum(p.correct.slice(0, k)),
        time: sum(p.seconds.slice(0, k))
      };
    });
    rows.push({ key: "you", name: "You", you: true, points: POINTS * sum(state.correct.slice(0, k)),
                time: sum(state.seconds.slice(0, k)) });
    // More points first; equal points split by less time; exact ties share a rank, "You" listed first.
    rows.sort(function (a, b) { return b.points - a.points || a.time - b.time || (b.you - a.you); });
    rows.forEach(function (r, j) {
      var prev = rows[j - 1];
      r.rank = prev && prev.points === r.points && prev.time === r.time ? prev.rank : j + 1;
    });
    return rows;
  }

  function moveTag(d) {
    if (d > 0) return el("span", "move up", "up " + d);
    if (d < 0) return el("span", "move down", "down " + (-d));
    return el("span", "move same", "No change");
  }

  // After an answer, each row slides from where it was to its new place, so moves are easy to follow.
  var lastOrder = null;
  function slideRows(table, order) {
    if (!lastOrder || REDUCED) return;
    var rows = table.querySelectorAll("tbody tr");
    if (!rows.length || !rows[0].animate) return;
    var h = rows[0].getBoundingClientRect().height;
    if (!h) return;
    Array.prototype.forEach.call(rows, function (tr, j) {
      var was = lastOrder.indexOf(order[j]);
      if (was < 0 || was === j) return;
      tr.animate([{ transform: "translateY(" + ((was - j) * h) + "px)" }, { transform: "none" }],
                 { duration: 520, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" });
    });
  }

  function boardNote(k) {
    if (k === 0) return "Everyone starts on 0 points.";
    return "After question " + k + ". Higher points first; equal points are split by faster time. " +
      (BOARD.status === "pilot"
        ? "Other players are Year 2 students who tested the game and agreed to share their scores."
        : "Other players are demo players until the pilot results are loaded.");
  }

  function boardTable(rows) {
    var table = el("table", "lb-table");
    var head = el("tr");
    [["Rank", ""], ["Player", ""], ["Points", "num"], ["Time", "num"]].forEach(function (h) {
      head.appendChild(el("th", h[1], h[0]));
    });
    table.appendChild(el("thead")).appendChild(head);
    var body = table.appendChild(el("tbody"));
    rows.forEach(function (r) {
      var tr = el("tr", r.you ? "you" : null);
      tr.appendChild(el("td", null, String(r.rank)));
      tr.appendChild(el("td", null, r.name));
      tr.appendChild(el("td", "num", String(r.points)));
      tr.appendChild(el("td", "num", mmss(r.time)));
      body.appendChild(tr);
    });
    return table;
  }

  function position(rows, k) {
    var me = rows.filter(function (r) { return r.you; })[0];
    state.ranks[k] = me.rank;
    var p = el("p", "lb-pos");
    p.appendChild(el("strong", null, ordinal(me.rank) + " of " + rows.length));
    if (k >= 2) p.appendChild(moveTag(state.ranks[k - 1] - me.rank));
    return { me: me, el: p };
  }

  function renderBoard() {
    if (mode !== "L") return;
    var k = state.correct.length;
    var rows = standings(k);
    var pos = position(rows, k);
    var order = rows.map(function (r) { return r.key; });

    var panel = $("lb-panel");
    panel.textContent = "";
    panel.appendChild(el("h2", null, "Leaderboard"));
    panel.appendChild(pos.el);
    panel.appendChild(el("p", "lb-note", boardNote(k)));
    slideRows(panel.appendChild(boardTable(rows)), order);

    var strip = $("lb-strip");
    strip.textContent = "";
    strip.appendChild(el("span", null, "Leaderboard: you are " + ordinal(pos.me.rank) + " of " + rows.length));

    var inline = $("lb-inline");
    inline.textContent = "";
    if (k > 0) {
      inline.appendChild(pos.el.cloneNode(true));
      inline.appendChild(el("p", "lb-note", boardNote(k)));
      slideRows(inline.appendChild(boardTable(rows)), order);
    }
    lastOrder = order;
  }

  /* ---------- Result ---------- */
  function checkChars(text) {
    // Each character code times its position, summed, mod 1296, as two base-36 digits.
    var total = 0;
    for (var i = 0; i < text.length; i++) total += (i + 1) * text.charCodeAt(i);
    var v = total % 1296;
    return DIGITS36.charAt(Math.floor(v / 36)) + DIGITS36.charAt(v % 36);
  }

  // A compact check string sent with each record (players never see it): the sheet rebuilds it
  // from the answers and times and refuses a record that does not match.
  function makeCode() {
    var body = set + mode + "-" + state.correct.join("") + "-" +
      state.seconds.map(function (s) { return ("0" + s).slice(-2); }).join("");
    return body + "-" + checkChars(body);
  }

  function finish() {
    var n = questions.length;
    $("result-score").textContent = String(state.score);
    $("result-max").textContent = " / " + n * POINTS;
    $("result-line").textContent = sum(state.correct) + " of " + n + " correct in " + mmss(sum(state.seconds));
    $("result-rank").hidden = mode !== "L";
    $("save-block").hidden = !timed;
    $("practice-block").hidden = timed;
    // The round as a spectrum: peaks rise one after another, tall for right, short for wrong.
    var box = $("result-ruler");
    buildRuler(box, n);
    Array.prototype.forEach.call(box.querySelectorAll(".slot"), function (slot, i) {
      slot.className = "slot grow " + (state.correct[i] ? "good" : "bad");
      slot.querySelector(".pk").style.animationDelay = (0.3 + i * 0.09).toFixed(2) + "s";
    });
    if (timed) {
      $("result-title").textContent = STUDY ? "Round " + study.round + " complete" : "Round complete";
      var rank = null, players = null;
      if (mode === "L") {
        var rows = standings(n), me = rows.filter(function (r) { return r.you; })[0];
        rank = me.rank;
        players = rows.length;
        $("result-rank").textContent = "You finished " + ordinal(rank) + " of " + players + " on the leaderboard.";
      }
      sendResults(rank, players);
    } else {
      $("result-title").textContent = "Practice complete";
    }
    show("result");
  }

  /* ---------- Results sheet: one record per finished round (off while resultsUrl is empty) ---------- */
  function roundId() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return "r" + Date.now().toString(36) + Math.random().toString(36).slice(2, 12);
  }

  function sendResults(rank, players) {
    if (!sheetUrl) { setSave("off"); return; }
    var rec = {
      v: 1, roundId: state.roundId || roundId(), pid: STUDY ? "" : pid, src: STUDY ? study.src : src,
      set: set, mode: mode, code: makeCode(), correct: state.correct, seconds: state.seconds,
      items: questions.map(function (q) { return q.id; }),
      rank: rank, players: players, layout: state.layout
    };
    if (STUDY) {
      rec.name = study.name;
      rec.sid = study.sid;
      rec.round = study.round;
      rec.group = study.group;
    }
    state.record = JSON.stringify(rec);
    startSaving();
  }

  // Up to four tries, a few seconds apart; then a Try again button starts another four.
  function startSaving() {
    state.tries = 0;
    setSave("saving");
    tryToSave();
  }

  function tryToSave() {
    if (state.save === "saved") return;
    var n = state.tries++, moved = false;
    if (n > 0) $("save-slow").hidden = false;
    function next() {             // this try failed, or has had no reply for too long
      if (moved) return;
      moved = true;
      clearTimeout(timeout);
      if (state.save === "saved") return;
      if (n < RETRY_DELAYS_MS.length) state.retry = setTimeout(tryToSave, RETRY_DELAYS_MS[n]);
      else setSave("failed");
    }
    var timeout = setTimeout(next, SAVE_TIMEOUT_MS);
    try {
      // A simple text POST needs no permission check from the browser, and the sheet's reply can
      // be read. "ok" means the round is in the sheet, even when it comes from an earlier try.
      fetch(sheetUrl, { method: "POST", keepalive: true,
                        headers: { "Content-Type": "text/plain;charset=utf-8" }, body: state.record })
        .then(function (res) { return res.text(); })
        .then(function (text) {
          if (String(text).trim() === "ok") { clearTimeout(timeout); clearTimeout(state.retry); setSave("saved"); }
          else next();
        }, next);
    } catch (e) { next(); }
  }

  /* End screen states: "saving", "saved" (then the next step), "failed" (Try again) and "off"
     (no results sheet in config.js). */
  function setSave(status) {
    state.save = status;
    $("save-status").textContent = {
      saving: "Saving your results…", saved: "Your results are saved",
      failed: "Your results haven't been saved yet", off: "Your results haven't been saved"
    }[status];
    $("save-status").className = "save-status" + (status === "saved" ? " good" : status === "saving" ? "" : " bad");
    if (status !== "saving") $("save-slow").hidden = true;
    var next = status === "saved" || (STUDY && status === "off");
    $("saved-steps").hidden = !next;
    if (next) showNext();
    $("save-failed").hidden = status !== "failed";
    $("save-off").hidden = status !== "off";
    if (status === "saved" || status === "off") state.guard = false;
  }

  // Once a round is saved: close the tab (one-round links), go to round 2, or open the
  // questionnaire with the game name already filled in.
  function showNext() {
    var last = STUDY && study.round === 2;
    $("next-close").hidden = STUDY;
    $("next-round").hidden = !(STUDY && study.round === 1);
    $("next-form").hidden = !(last && formUrl);
    $("next-done").hidden = !(last && !formUrl);
    if (!last) return;
    $("form-name").textContent = study.name;
    $("done-name").textContent = study.name;
    if (formUrl) $("form-link").href = formUrl + "?usp=pp_url&" + CONFIG.formNameField + "=" + encodeURIComponent(study.name);
  }

  /* ---------- Enlarged spectrum ---------- */
  function openZoom() {
    var q = questions[state.i];
    $("zoom-img").src = q.image;
    $("zoom-img").alt = q.alt;
    $("zoom").hidden = false;
    document.body.classList.add("noscroll");
    $("btn-zoom-close").focus();
  }

  function closeZoom() {
    $("zoom").hidden = true;
    document.body.classList.remove("noscroll");
    $("btn-zoom").focus({ preventScroll: true });
  }

  /* ---------- Wiring ---------- */
  function init() {
    $("btn-start").addEventListener("click", begin);
    $("btn-next").addEventListener("click", next);
    $("btn-again").addEventListener("click", begin);
    $("btn-round2").addEventListener("click", toRound2);
    $("signup").addEventListener("submit", signUp);
    $("btn-zoom").addEventListener("click", openZoom);
    $("btn-zoom-close").addEventListener("click", closeZoom);
    $("zoom").addEventListener("click", function (ev) { if (ev.target === $("zoom")) closeZoom(); });
    $("btn-retry").addEventListener("click", function () {
      if (state.save === "failed") startSaving();
    });

    document.addEventListener("keydown", function (ev) {
      if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
      if (!$("zoom").hidden) {
        if (ev.key === "Escape") { ev.preventDefault(); closeZoom(); }
        return;
      }
      if ($("screen-play").hidden) return;
      var key = ev.key || "";
      var k = key.length === 1 ? "1234".indexOf(key) : -1;
      if (k < 0 && key.length === 1) k = "abcd".indexOf(key.toLowerCase());
      if (k >= 0) { ev.preventDefault(); choose(k, performance.now()); return; }
      if (key === "Enter" && !$("feedback").hidden) { ev.preventDefault(); next(); }
    });

    window.addEventListener("beforeunload", function (ev) {
      if (state && state.guard) { ev.preventDefault(); ev.returnValue = ""; }
    });

    setInterval(updateClock, 250);

    if (STUDY) {
      study = loadStudy();
      if (study) enterRound(false);
      else showSignup();
      return;
    }
    if (!questions) { show("broken"); return; }
    setupStart();
    show("start");
  }

  init();
})();
