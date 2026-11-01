const express = require('express');
const app = express();
const context = require('./controllers/context')();
require('./middleware/security')(app, context);
require('./routes/pages')(app, context);
require('./routes/api')(app, context);
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  console.error('Request failed:', err.message);
  res.status(err.status || 500).json({ error: err.status === 400 ? 'Dữ liệu yêu cầu không hợp lệ.' : 'Không thể xử lý yêu cầu. Vui lòng thử lại.' });
});


app.startMaintenance = context.startMaintenance;
module.exports = app;
