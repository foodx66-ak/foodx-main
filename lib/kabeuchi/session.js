/**
 * Undoes the turn that was in flight when the AI call failed (or the function died).
 * Time the user had already spent stays spent; the clock restarts from `now`.
 */
export function rollbackTurn(session, now = Date.now()) {
  const pending = session.pending || { state: session.history.length ? "user" : "ready", historyLen: session.history.length, userTurns: session.userTurns };
  session.history = session.history.slice(0, pending.historyLen);
  session.userTurns = pending.userTurns;
  session.state = pending.state;
  if (session.state === "user") session.lastAiDoneAt = now;
  delete session.pending;
  return session;
}

export function currentRemainingMs(session, now = Date.now()) {
  if (session.state === "user" && session.lastAiDoneAt) {
    return Math.max(0, session.remainingMs - (now - session.lastAiDoneAt));
  }
  return Math.max(0, session.remainingMs);
}
