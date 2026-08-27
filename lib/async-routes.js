// Express 4 vangt fouten uit async route-handlers niet op: een afgewezen promise
// wordt een "unhandled rejection" en laat de server hangen of crashen.
// Deze patch zorgt dat zulke fouten netjes bij de foutafhandeling terechtkomen.
// Moet worden geladen vóórdat routers worden aangemaakt.

const Layer = require('express/lib/router/layer');

Object.defineProperty(Layer.prototype, 'handle', {
  enumerable: true,
  get() { return this.__handle; },
  set(fn) {
    if (typeof fn !== 'function' || fn.length === 4) { this.__handle = fn; return; }
    this.__handle = function gewikkeld(req, res, next) {
      const r = fn.call(this, req, res, next);
      if (r && typeof r.catch === 'function') r.catch(next);
      return r;
    };
  }
});
