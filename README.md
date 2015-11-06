# addon-proxy

Allows Firefox addon-sdk extensions to modify incoming HTML and JS responses. Usage:

    var proxy = require("addon-proxy");
    
    proxy.rewrite({
      html: function(data, req) {
        return foo(data);
      },
      js: function(data, req) {
        // req is the nsIHttpChannel that is passed to nsIStreamListener's methods.
        if (req.URI.host === "localhost")
          return data;
        else
          return bar(data);
      },
      other: function(data, req) {
        // or don't pass it at all, default behavior is just `return data;`
        return data;
      }
    });

To keep the API simple, this is a caching proxy, i.e. it does not stream responses,
it only forwards data when the request has been full downloaded from the server.

Also, there is currently no support for stopping/cleanup.
