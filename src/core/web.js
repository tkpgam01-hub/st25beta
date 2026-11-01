// Public browser configuration only. Never place credentials in this file.
(function (root) {
  const config = Object.freeze({name: 'ST25 VIETNAM', readTimeoutMs: 10000, apiPrefix: '/api'});
  if (typeof module === 'object' && module.exports) module.exports = config;
  else root.ST25Core = config;
})(typeof globalThis === 'object' ? globalThis : this);
