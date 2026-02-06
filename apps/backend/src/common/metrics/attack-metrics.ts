import { Counter, Gauge, register } from 'prom-client';

// Prometheus metrics for attack detection
export const attackTotal = new Counter({
  name: 'cyber_attacks_total',
  help: 'Total number of detected cyber attacks',
  labelNames: ['attack_type', 'severity', 'ip'],
  registers: [register],
});

export const attackRate = new Gauge({
  name: 'cyber_attack_rate_per_minute',
  help: 'Current attack rate per minute',
  labelNames: ['attack_type'],
  registers: [register],
});

export const activeAttacks = new Gauge({
  name: 'active_cyber_attacks',
  help: 'Number of active attacks in the last 5 minutes',
  labelNames: ['attack_type', 'severity'],
  registers: [register],
});

export const suspiciousIPs = new Gauge({
  name: 'suspicious_ips_count',
  help: 'Number of suspicious IP addresses',
  labelNames: ['attack_type'],
  registers: [register],
});

