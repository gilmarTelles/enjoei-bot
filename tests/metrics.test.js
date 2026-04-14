const metrics = require('../src/metrics');

beforeEach(() => {
  metrics.reset();
});

test('recordApiCall tracks statuses', () => {
  metrics.recordApiCall(200);
  metrics.recordApiCall(201);
  metrics.recordApiCall(403);
  metrics.recordApiCall(429);
  metrics.recordApiCall(500);

  const stats = metrics.getStats();
  expect(stats.apiCalls.total).toBe(5);
  expect(stats.apiCalls.success).toBe(2);
  expect(stats.apiCalls.cfBlock).toBe(1);
  expect(stats.apiCalls.rateLimit).toBe(1);
  expect(stats.apiCalls.fail).toBe(1);
});

test('cache stats', () => {
  metrics.recordCacheHit();
  metrics.recordCacheHit();
  metrics.recordCacheMiss();

  const stats = metrics.getStats();
  expect(stats.cacheHitRate).toBe('66.7');
  expect(stats.cacheStats.hits).toBe(2);
  expect(stats.cacheStats.misses).toBe(1);
});

test('response time rolling window', () => {
  for (let i = 0; i < 60; i++) {
    metrics.recordResponseTime(100);
  }
  metrics.recordResponseTime(200);

  const stats = metrics.getStats();
  expect(stats.avgResponseTime).toBeGreaterThan(100);
});

test('poll cycle tracking', () => {
  metrics.recordPollCycle(true);
  metrics.recordPollCycle(false);
  metrics.recordPollCycle(false);

  const stats = metrics.getStats();
  expect(stats.pollCycles.total).toBe(3);
  expect(stats.pollCycles.withNew).toBe(1);
  expect(stats.pollCycles.empty).toBe(2);
});

test('search log capped at 50', () => {
  for (let i = 0; i < 55; i++) {
    metrics.recordSearch(`kw${i}`, 'enjoei', i, 0);
  }
  const searches = metrics.getRecentSearches(100);
  expect(searches.length).toBe(50);
});

test('getRecentSearches respects limit', () => {
  for (let i = 0; i < 10; i++) {
    metrics.recordSearch(`kw${i}`, 'enjoei', i, 0);
  }
  const searches = metrics.getRecentSearches(5);
  expect(searches.length).toBe(5);
});

test('search log entries have expected fields', () => {
  metrics.recordSearch('nike', 'enjoei', 5, 2, 'timeout');
  const searches = metrics.getRecentSearches(1);
  expect(searches[0].keyword).toBe('nike');
  expect(searches[0].platform).toBe('enjoei');
  expect(searches[0].resultCount).toBe(5);
  expect(searches[0].newCount).toBe(2);
  expect(searches[0].error).toBe('timeout');
  expect(searches[0].timestamp).toBeTruthy();
});

test('CF status tracking', () => {
  metrics.updateCfStatus(true, Date.now() + 60000, 3);
  const health = metrics.getHealth();
  expect(health.cfBlocked).toBe(true);
  expect(health.cfBlockedCount).toBe(3);

  metrics.updateCfStatus(false, 0, 0);
  const health2 = metrics.getHealth();
  expect(health2.cfBlocked).toBe(false);
});

test('recordError', () => {
  metrics.recordError('something broke');
  const stats = metrics.getStats();
  expect(stats.lastError).toBe('something broke');
  expect(stats.lastErrorTime).toBeTruthy();
});

test('uptime is non-empty string', () => {
  const uptime = metrics.getUptime();
  expect(typeof uptime).toBe('string');
  expect(uptime.length).toBeGreaterThan(0);
});

test('apiSuccessRate null when no calls', () => {
  expect(metrics.getStats().apiSuccessRate).toBeNull();
});

test('cacheHitRate null when no cache ops', () => {
  expect(metrics.getStats().cacheHitRate).toBeNull();
});

test('avgResponseTime null when no data', () => {
  expect(metrics.getStats().avgResponseTime).toBeNull();
});

test('reset clears everything', () => {
  metrics.recordApiCall(200);
  metrics.recordCacheHit();
  metrics.recordResponseTime(100);
  metrics.recordPollCycle(false);
  metrics.recordSearch('test', 'enjoei', 1, 0);
  metrics.recordError('err');
  metrics.updateCfStatus(true, 1, 1);

  metrics.reset();

  const stats = metrics.getStats();
  expect(stats.apiCalls.total).toBe(0);
  expect(stats.cacheStats.hits).toBe(0);
  expect(stats.avgResponseTime).toBeNull();
  expect(stats.pollCycles.total).toBe(0);
  expect(stats.lastError).toBeNull();
  expect(stats.cfStatus.blocked).toBe(false);
});
