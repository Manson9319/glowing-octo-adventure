const dayjs = require("dayjs");
const config = require("../config");

// In-memory state (survives restarts via simple file-based persistence)
const fs = require("fs");
const STATE_FILE = "./logs/state.json";

function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) return JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
  } catch {}
  return {
    startDate: null,
    currentDay: 0,
    todaysMeals: [],
    active: false,
  };
}

function saveState(state) {
  fs.mkdirSync("./logs", { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

let state = loadState();

function startProgramme() {
  state.startDate = dayjs().format("YYYY-MM-DD");
  state.currentDay = 1;
  state.todaysMeals = [];
  state.active = true;
  saveState(state);
}

function getCurrentDay() {
  if (!state.startDate) return 0;
  const start = dayjs(state.startDate);
  const today = dayjs();
  return Math.min(today.diff(start, "day") + 1, config.programme.days);
}

function addMeal(mealEntry) {
  state.todaysMeals.push(mealEntry);
  saveState(state);
}

function getTodaysMeals() {
  return state.todaysMeals;
}

function resetDayMeals() {
  state.todaysMeals = [];
  saveState(state);
}

function isActive() {
  return state.active && getCurrentDay() <= config.programme.days;
}

function getState() {
  return { ...state, currentDay: getCurrentDay() };
}

module.exports = { startProgramme, getCurrentDay, addMeal, getTodaysMeals, resetDayMeals, isActive, getState };
