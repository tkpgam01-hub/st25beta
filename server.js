// Node/Vercel entry point. Application logic lives under src/.
const app = require('./src/app');
const Core = require('./src/core/config');
if (require.main === module) {
  app.startMaintenance();
  app.listen(Core.port, () => console.log(`ST25 portal: http://localhost:${Core.port}`));
}
module.exports = app;
