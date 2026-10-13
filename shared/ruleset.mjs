// Course length is part of the rules: shorter laps cannot rank on extended tracks.
export const CURRENT_RULESET = 'flow600-balance-v4';
export const ACCEPTED_RULESETS = ['legacy', 'flow600-v1', 'flow600-long-v2', 'flow600-smoke-v3', CURRENT_RULESET];
export const BEST_STORAGE_PREFIX = `godspeed:${CURRENT_RULESET}:best`;
