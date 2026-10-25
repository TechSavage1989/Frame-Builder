'use strict';
// Electron main-process timers are independent of Chromium background throttling.
const INTERVAL_MS = 5 * 60 * 1000;
const FOCUS_MS = 2 * 60 * 1000;
function bindUpdateSchedule({ window, checker, online = () => true, interval = INTERVAL_MS, focusAge = FOCUS_MS, clock = Date.now }) {
  let stopped = false;
  const check = () => { if (!stopped && online() && !window.isDestroyed()) return checker.check(false); };
  const focus = () => { if (clock() - checker.lastAt >= focusAge) check(); };
  const timer = setInterval(check, interval);
  const stop = () => {
    stopped = true; clearInterval(timer); window.removeListener('focus', focus);
  };
  window.on('focus', focus);
  window.once('closed', stop);
  check();
  return stop;
}
module.exports = { bindUpdateSchedule, INTERVAL_MS, FOCUS_MS };
