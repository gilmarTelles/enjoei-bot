const MAX_RESPONSE_TIMES = 50;
const MAX_SEARCH_LOG = 50;

const apiCalls = { total: 0, success: 0, fail: 0, cfBlock: 0, rateLimit: 0 };
const cacheStats = { hits: 0, misses: 0 };
const responseTimes = [];
const pollCycles = { total: 0, empty: 0, withNew: 0 };
const searchLog = [];
const cfStatus = { blocked: false, cooldownUntil: 0, blockedCount: 0 };
let lastError = null;
let lastErrorTime = null;
const startTime = Date.now();

function recordApiCall(status) {
  apiCalls.total++;
  if (status >= 200 && status < 300) {
    apiCalls.success++;
  } else if (status === 403 || status === 503) {
    apiCalls.cfBlock++;
  } else if (status === 429) {
    apiCalls.rateLimit++;
  } else {
    apiCalls.fail++;
  }
}

function recordCacheHit() {
  cacheStats.hits++;
}

function recordCacheMiss() {
  cacheStats.misses++;
}

function recordResponseTime(ms) {
  responseTimes.push(ms);
  if (responseTimes.length > MAX_RESPONSE_TIMES) responseTimes.shift();
}

function recordPollCycle(hasNew) {
  pollCycles.total++;
  if (hasNew) {
    pollCycles.withNew++;
  } else {
    pollCycles.empty++;
  }
}

function recordSearch(keyword, platform, resultCount, newCount, error) {
  searchLog.push({
    keyword,
    platform,
    resultCount,
    newCount,
    error: error || null,
    timestamp: new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
  });
  if (searchLog.length > MAX_SEARCH_LOG) searchLog.shift();
}

function updateCfStatus(blocked, cooldownUntil, blockedCount) {
  cfStatus.blocked = blocked;
  if (cooldownUntil !== undefined) cfStatus.cooldownUntil = cooldownUntil;
  if (blockedCount !== undefined) cfStatus.blockedCount = blockedCount;
}

function recordError(msg) {
  lastError = msg;
  lastErrorTime = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

function getUptime() {
  const ms = Date.now() - startTime;
  const days = Math.floor(ms / 86400000);
  const hours = Math.floor((ms % 86400000) / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0 || days > 0) parts.push(`${hours}h`);
  parts.push(`${minutes}m`);
  return parts.join(' ');
}

function getAvgResponseTime() {
  if (responseTimes.length === 0) return null;
  const sum = responseTimes.reduce((a, b) => a + b, 0);
  return Math.round(sum / responseTimes.length);
}

function getApiSuccessRate() {
  if (apiCalls.total === 0) return null;
  return ((apiCalls.success / apiCalls.total) * 100).toFixed(1);
}

function getCacheHitRate() {
  const total = cacheStats.hits + cacheStats.misses;
  if (total === 0) return null;
  return ((cacheStats.hits / total) * 100).toFixed(1);
}

function getStats() {
  return {
    apiCalls: { ...apiCalls },
    cacheStats: { ...cacheStats },
    avgResponseTime: getAvgResponseTime(),
    apiSuccessRate: getApiSuccessRate(),
    cacheHitRate: getCacheHitRate(),
    pollCycles: { ...pollCycles },
    uptime: getUptime(),
    lastError,
    lastErrorTime,
    cfStatus: { ...cfStatus },
  };
}

function getHealth() {
  return {
    cfBlocked: cfStatus.blocked,
    cfCooldownUntil: cfStatus.cooldownUntil,
    cfBlockedCount: cfStatus.blockedCount,
    apiSuccessRate: getApiSuccessRate(),
    avgResponseTime: getAvgResponseTime(),
    lastError,
    lastErrorTime,
    uptime: getUptime(),
    pollCycles: { ...pollCycles },
  };
}

function getRecentSearches(limit) {
  return searchLog.slice(-(limit || 20)).reverse();
}

function reset() {
  apiCalls.total = 0;
  apiCalls.success = 0;
  apiCalls.fail = 0;
  apiCalls.cfBlock = 0;
  apiCalls.rateLimit = 0;
  cacheStats.hits = 0;
  cacheStats.misses = 0;
  responseTimes.length = 0;
  pollCycles.total = 0;
  pollCycles.empty = 0;
  pollCycles.withNew = 0;
  searchLog.length = 0;
  cfStatus.blocked = false;
  cfStatus.cooldownUntil = 0;
  cfStatus.blockedCount = 0;
  lastError = null;
  lastErrorTime = null;
}

module.exports = {
  recordApiCall,
  recordCacheHit,
  recordCacheMiss,
  recordResponseTime,
  recordPollCycle,
  recordSearch,
  updateCfStatus,
  recordError,
  getStats,
  getHealth,
  getRecentSearches,
  getUptime,
  reset,
};
