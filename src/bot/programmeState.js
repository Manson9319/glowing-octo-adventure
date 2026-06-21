const dayjs = require("dayjs");
const fs = require("fs");
const config = require("../config");

const STATE_FILE = "./logs/state.json";

function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) return JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
  } catch {}
  return {
    startDate: null,
    active: false,
    todaysMeals: [],
    todaysWaterMl: 0,
    todaysExercises: [],
    todaysSleep: null,
  };
}

function saveState(state) {
  fs.mkdirSync("./logs", { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

let state = loadState();

function startProgramme() {
  state.startDate = dayjs().format("YYYY-MM-DD");
  state.active = true;
  state.todaysMeals = [];
  state.todaysWaterMl = 0;
  state.todaysExercises = [];
  state.todaysSleep = null;
  saveState(state);
}

function getCurrentDay() {
  if (!state.startDate) return 0;
  return Math.min(dayjs().diff(dayjs(state.startDate), "day") + 1, config.programme.days);
}

function isActive() {
  return state.active && getCurrentDay() <= config.programme.days;
}

// ── Meals ────────────────────────────────────────────────────────────────────
function addMeal(entry) {
  state.todaysMeals.push(entry);
  saveState(state);
}

function getTodaysMeals() {
  return state.todaysMeals;
}

// ── Water ────────────────────────────────────────────────────────────────────
function addWater(ml) {
  state.todaysWaterMl = (state.todaysWaterMl || 0) + ml;
  saveState(state);
  return state.todaysWaterMl;
}

function getTodaysWater() {
  return state.todaysWaterMl || 0;
}

// ── Exercise ─────────────────────────────────────────────────────────────────
function addExercise(description) {
  if (!state.todaysExercises) state.todaysExercises = [];
  state.todaysExercises.push(description);
  saveState(state);
}

function getTodaysExercises() {
  return state.todaysExercises || [];
}

// ── Sleep ────────────────────────────────────────────────────────────────────
function setSleep(hours, quality) {
  state.todaysSleep = { hours, quality };
  saveState(state);
}

function getTodaysSleep() {
  return state.todaysSleep || null;
}

// ── Day reset (called at midnight by scheduler) ──────────────────────────────
function resetDay() {
  state.todaysMeals = [];
  state.todaysWaterMl = 0;
  state.todaysExercises = [];
  state.todaysSleep = null;
  saveState(state);
}

function getState() {
  return {
    ...state,
    currentDay: getCurrentDay(),
  };
}

module.exports = {
  startProgramme,
  getCurrentDay,
  isActive,
  getState,
  addMeal,
  getTodaysMeals,
  addWater,
  getTodaysWater,
  addExercise,
  getTodaysExercises,
  setSleep,
  getTodaysSleep,
  resetDay,
};
