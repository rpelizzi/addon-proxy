/* globals exports: true, require: false */
var events = require("sdk/system/events");
var {Ci, Cu, Cc, Cr, Cm, CC} = require("chrome");
var components = require("chrome").components;
var {TDict} = require("./tdict");

Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://gre/modules/XPCOMUtils.jsm");

var BinaryInputStream = CC("@mozilla.org/binaryinputstream;1", "nsIBinaryInputStream", "setInputStream");
var BinaryOutputStream = CC("@mozilla.org/binaryoutputstream;1", "nsIBinaryOutputStream", "setOutputStream");
var StorageStream = CC("@mozilla.org/storagestream;1", "nsIStorageStream", "init");
var StringStreamC = Cc["@mozilla.org/io/string-input-stream;1"];

const TIMEOUT = 360 * 1000;

exports.rewrite = function(rewriter, timeout = TIMEOUT) {

  var docCache = new TDict(timeout);
  var scriptCache = new TDict(timeout);
  var sourceCache = new TDict(timeout);

  function TracingListener() {
    this.data = "";
    // some (all?) 0-length requests never fire onDataAvailable, we should avoid firing it too
    this.onDataFired = false;
  }

  TracingListener.prototype = {
    onDataAvailable: function(req, ctx, inputStream, offset, count) {
      this.onDataFired = true;
      try {
        var iStream = new BinaryInputStream(inputStream);
        this.data += iStream.readBytes(count);
      } catch (e) {
        console.log("> available", e.message, e.lineNumber, req.originalURI.spec, this.data.length, req.responseStatus);
        req.cancel(e.result);
      }
    },
    onStartRequest: function(req, ctx) {
      try{
        this.oldListener.onStartRequest(req, ctx);
      } catch (e) {
        console.log("> start", e.message, e.lineNumber, req.originalURI.spec, this.data.length, req.responseStatus);
        req.cancel(e.result);
      }
    },
    onStopRequest: function(req, ctx, code) {
      try {
        if (!this.onDataFired)
          return this.oldListener.onStopRequest(req, ctx, code);

        var data = this.data;
        req.QueryInterface(Ci.nsIHttpChannel);
        var isHTML = (docCache[req.originalURI.spec] || docCache[req.URI.spec]) && req.contentType && req.contentType.indexOf("html") > 0;
        var isJs = (scriptCache[req.originalURI.spec] || scriptCache[req.URI.spec]) && req.contentType.indexOf("javascript") >= 0;

        // editor loads don't trigger view source URIs, just the normal url.
        // however, they don't trigger the content policy either.
        // if (req.originalURI.scheme === "view-source")

        for (pattern in rewriter.responses) {
          if (!rewriter.responses.hasOwnProperty(pattern))
            continue;
          var response = rewriter.responses[pattern];
          if (req.originalURI.spec.includes(pattern)) {
            var stream = StringStreamC.createInstance(Ci.nsIStringInputStream);
            stream.setData(response, -1);
            this.oldListener.onDataAvailable(req, ctx, stream, 0, stream.available());
            this.oldListener.onStopRequest(req, ctx, Cr.NS_OK);
            return;
          }
        }

        // simpler conditions for view-source
        if (sourceCache[req.originalURI.spec]) {
          // console.log("SOURCE", req.originalURI.spec);
          isHTML = req.contentType.indexOf("text/html") > -1;
          isJs = req.contentType.indexOf("javascript") > -1;
        }

        if (isHTML && rewriter.html)
          data = rewriter.html(data, req);
        else if (isJs && rewriter.js)
          data = rewriter.js(data, req);
        else
          data = rewriter.other ? rewriter.other(data, req) : data;

        var sStream = new StorageStream(8192, data.length + 2000, null);
        var oStream = new BinaryOutputStream(sStream.getOutputStream(0));
        oStream.writeBytes(data, data.length);

        this.oldListener.onDataAvailable(req, ctx, sStream.newInputStream(0), 0, data.length);
        this.oldListener.onStopRequest(req, ctx, code);
      } catch (e) {
        if (e.message.indexOf("NS_BINDING_ABORTED") === -1 && data.length > 0)
          console.log("> stop", e.message, e.lineNumber, req.originalURI.spec, this.data.length, req.responseStatus);
        req.cancel(e.result);
      }
    },
    QueryInterface: function(aIID) {
      if (aIID.equals(Ci.nsIStreamListener) || aIID.equals(Ci.nsISupports)) {
        return this;
      }
      throw Cr.NS_NOINTERFACE;
    }
  };

  var observer = function(ev) {
    try {
      var subject = ev.subject;
      subject.QueryInterface(Ci.nsIHttpChannel);
      if (subject.responseStatus === 204)
        return;
      if (subject.responseStatus >= 300 && subject.responseStatus < 400)
        return;
      var listener = new TracingListener();
      subject.QueryInterface(Ci.nsITraceableChannel);
      listener.oldListener = subject.setNewListener(listener);
    } catch (e) {
      console.log("obs", e.message);
    }
  };


  var policy = {
    classDescription: "Addon-proxy content policy",
    classID: components.ID("{4cc3e324-849a-11e5-95c4-375ad1a90aa9}"),
    contractID: "@sunysb.edu/proxy-policy;1",
    xpcom_categories: ["content-policy"],

    shouldLoad: function(contentType, contentLocation, requestOrigin, node, mimeTypeGuess, extra) {
      if (!contentLocation || contentLocation.scheme === "chrome" || contentLocation.scheme === "about")
        return Ci.nsIContentPolicy.ACCEPT;
      // console.log("shouldLoad: ", arguments);

      // pass-through, useful for debugging
      if (contentLocation.spec.includes("proxypass=true"))
        return Ci.nsIContentPolicy.ACCEPT;

      try {
        //console.log(requestOrigin.spec, contentLocation.spec, contentType, mimeTypeGuess);
        if (contentLocation.scheme === "view-source") {
          sourceCache[contentLocation.spec] = true;
        } else if (contentType === Ci.nsIContentPolicy.TYPE_SCRIPT)
          scriptCache[contentLocation.spec] = true;
        else if (contentType === Ci.nsIContentPolicy.TYPE_DOCUMENT || contentType === Ci.nsIContentPolicy.TYPE_SUBDOCUMENT)
          docCache[contentLocation.spec] = true;
        return Ci.nsIContentPolicy.ACCEPT;
      } catch (e) {
        console.log("shl", e.message);
      }
    },

    shouldProcess: function(contentType, contentLocation, requestOrigin, node, mimeTypeGuess, extra) {
      return Ci.nsIContentPolicy.ACCEPT;
    },

    // nsIFactory interface implementation
    createInstance: function(outer, iid) {
      if (outer)
        throw Cr.NS_ERROR_NO_AGGREGATION;
      return this.QueryInterface(iid);
    },

    // nsISupports interface implementation
    QueryInterface: XPCOMUtils.generateQI([Ci.nsIContentPolicy, Ci.nsIFactory])
  };

  // main code
  events.on("http-on-examine-response", observer, true);

  var registrar = Cm.QueryInterface(Ci.nsIComponentRegistrar);
  registrar.registerFactory(policy.classID, policy.classDescription, policy.contractID, policy);

  var catMan = Cc["@mozilla.org/categorymanager;1"].getService(Ci.nsICategoryManager);
  catMan.addCategoryEntry("content-policy", policy.contractID, policy.contractID, false, true);
};
