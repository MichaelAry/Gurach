import { env } from '../common/env.js';

console.log('Server runtime configuration is valid', {
  nodeEnv: env.nodeEnv,
  host: env.host,
  port: env.port,
});
