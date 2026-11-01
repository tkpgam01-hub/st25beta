// Register feature controllers in their existing order.
module.exports = (app, context) => {
  require('../controllers/server')(app, context);
  require('../controllers/player')(app, context);
  require('../controllers/quests')(app, context);
  require('../controllers/map')(app, context);
  require('../controllers/team')(app, context);
  require('../controllers/garage')(app, context);
  require('../controllers/market')(app, context);
  require('../controllers/admin')(app, context);
  require('../controllers/trade')(app, context);
  require('../controllers/carcass')(app, context);
  require('../controllers/support')(app, context);
  require('../controllers/referral')(app, context);
  require('../controllers/teleport')(app, context);
  require('../controllers/shop')(app, context);
  require('../controllers/skin')(app, context);
  require('../controllers/crates')(app, context);
  require('../controllers/leaderboard')(app, context);
  require('../controllers/plinko')(app, context);
  require('../controllers/roulette')(app, context);
};
