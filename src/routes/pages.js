const path = require('node:path');
const fs = require('node:fs');
const express = require('express');
const Core = require('../core/config');
const {renderPage} = require('../views/render');

module.exports = function registerPages(app, {getConfig}) {
  app.get('/assets/js/core.js', (req, res) => res.sendFile(path.join(Core.root, 'src/core/web.js')));
  app.get('/assets/js/api/endpoints.js', (req, res) => res.sendFile(path.join(Core.root, 'src/api/endpoints.js')));
  app.use('/assets/js/features', express.static(Core.featuresDir, {dotfiles:'deny', index:false}));
  app.use('/assets', express.static(Core.assetsDir, {dotfiles:'deny', index:false}));
  app.use('/cdn/skinviewer', express.static(path.join(Core.assetsDir,'vendor/islepilot-skin/cdn/skinviewer'), {dotfiles:'deny',index:false,maxAge:'7d'}));
  app.get(['/', '/:page', '/pages/:page'], (req, res, next) => {
    const page = req.params.page || 'index.html';
    if (!/^[a-zA-Z0-9_-]+\.html$/.test(page)) return next();
    if (!fs.existsSync(path.join(Core.pagesDir, page))) return next();
    // Resolve relative links from the canonical root URL.
    if (req.path.startsWith('/pages/')) return res.redirect(308, '/' + page);
    try { res.type('html').send(renderPage(page)); } catch (error) { next(error); }
  });
};
