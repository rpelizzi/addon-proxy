var timers = require("sdk/timers");
// A TDict is a javascript object whose keys expire after `timeout` milliseconds.

var INTERVAL = 10 * 1000;

exports.TDict = function(timeout) {
  return new Proxy({}, {
    set: function(target, name, value) {
      target[name] = value;
      if (!target.__ts) {
        target.__ts = {};
        timers.setInterval(function() {
          var now = Date.now();
          Object.keys(target.__ts).forEach(function(k) {
            if (target.__ts[k] + timeout < now) {
              delete target.__ts[k];
              delete target[k];
            }
          });
        }, INTERVAL);
      }
      target.__ts[name] = Date.now();
    }
  });
};
