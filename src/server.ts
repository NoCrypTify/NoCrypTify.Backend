import { buildApp } from './app.js';
import { config } from './config.js';

const app = buildApp();

await app.listen({ port: config.port, host: config.host }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});

process.on('SIGTERM', async () => {
  await app.close();
  process.exit(0);
});
