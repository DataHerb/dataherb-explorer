// Job health, mirrored from dhx/status.py `assess`. Keep the two in sync.

export const HEALTH_ORDER = ['failing', 'stuck', 'stale', 'degraded', 'running', 'healthy', 'unknown'];

export const HEALTH_LABEL = {
  failing: 'Failing',
  stuck: 'Stuck',
  stale: 'Stale',
  degraded: 'Degraded',
  running: 'Running',
  healthy: 'Healthy',
  unknown: 'Unknown',
};

const ALIASES = { hourly: 'PT1H', daily: 'P1D', weekly: 'P1W', monthly: 'P31D', quarterly: 'P92D', yearly: 'P366D', annually: 'P366D' };

/** ISO 8601 duration -> milliseconds (months = 30 d, years = 365 d). */
export function parseDuration(v) {
  if (!v) return null;
  const s = ALIASES[String(v).toLowerCase()] || String(v);
  const m = /^P(?:(\d+)Y)?(?:(\d+)M)?(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/.exec(s);
  if (!m || s === 'P') return null;
  const [y, mo, w, d, hh, mm, ss] = m.slice(1).map((x) => Number(x || 0));
  return ((((y * 365 + mo * 30 + w * 7 + d) * 24 + hh) * 60 + mm) * 60 + ss) * 1000;
}

function human(ms) {
  const s = Math.floor(ms / 1000);
  for (const [u, n] of [['d', 86400], ['h', 3600], ['m', 60]]) if (s >= n) return `${Math.floor(s / n)}${u}`;
  return `${s}s`;
}

const t = (v) => (v ? Date.parse(v) : NaN);

export function assess(state, now = Date.now(), grace = 0.5) {
  const job = state.job || {};
  const run = state.run || {};
  const status = run.status;
  const expected = parseDuration(job.expected_interval);
  const maxDuration = parseDuration(job.max_duration);
  let lastSuccess = state.last_success;
  if (status === 'success') lastSuccess = run;
  const lsAt = lastSuccess ? t(lastSuccess.finished_at || lastSuccess.started_at) : NaN;
  const hasLs = !Number.isNaN(lsAt);
  const nextExpected = hasLs && expected ? new Date(lsAt + expected).toISOString() : null;
  const stale = Boolean(expected && (!hasLs || now - lsAt > expected * (1 + grace)));
  const out = (health, reason) => ({
    health,
    reason,
    last_success_at: hasLs ? new Date(lsAt).toISOString() : null,
    next_expected_at: nextExpected,
  });
  const staleReason = () => (hasLs ? `last success ${human(now - lsAt)} ago` : 'never succeeded');

  if (!state.run) return out('unknown', 'no runs recorded');
  const started = t(run.started_at);
  if (status === 'running' || status === 'queued') {
    if (maxDuration && !Number.isNaN(started) && now - started > maxDuration)
      return out('stuck', `${status} for ${human(now - started)} (max ${job.max_duration})`);
    if (stale) return out('stale', staleReason());
    return out('running', Number.isNaN(started) ? status : `${status} for ${human(now - started)}`);
  }
  if (status === 'failed' || status === 'cancelled') {
    const err = (run.error && run.error.message) || run.message || '';
    return out('failing', `last run ${status}${err ? `: ${err}` : ''}`);
  }
  if (stale) return out('stale', staleReason());
  const failedChecks = (state.checks || []).filter((c) => c.status === 'fail').map((c) => c.name);
  if (status === 'partial' || failedChecks.length)
    return out('degraded', status === 'partial' ? 'last run partial' : `checks failed: ${failedChecks.join(', ')}`);
  if (status === 'success' || status === 'skipped')
    return out('healthy', status === 'success' ? 'last run succeeded' : 'last run skipped');
  return out('unknown', `unrecognised status '${status}'`);
}

export function worst(healths) {
  const hs = healths.filter(Boolean);
  if (!hs.length) return null;
  return hs.sort((a, b) => HEALTH_ORDER.indexOf(a) - HEALTH_ORDER.indexOf(b))[0];
}
