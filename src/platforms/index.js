const enjoei = require('./enjoei');
const mercadolivre = require('./mercadolivre');
const olx = require('./olx');

const platforms = {
  enjoei,
  ml: mercadolivre,
  olx,
};

const PLATFORM_ALIASES = {
  enjoei: 'enjoei',
  ml: 'ml',
  mercadolivre: 'ml',
  'mercado livre': 'ml',
  olx: 'olx',
};

const DEFAULT_PLATFORM = 'enjoei';

function getPlatform(key) {
  return platforms[key] || null;
}

function resolvePlatformAlias(input) {
  if (!input) return null;
  const normalized = input.toLowerCase().trim();
  return PLATFORM_ALIASES[normalized] || null;
}

function getAllPlatformKeys() {
  return Object.keys(platforms);
}

module.exports = {
  getPlatform,
  resolvePlatformAlias,
  getAllPlatformKeys,
  DEFAULT_PLATFORM,
};
