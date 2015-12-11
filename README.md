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
      },
      responses: {
        "fakefile.js": "alert(fake)",
        "mydir/myfile": file.read(path)
      }
    });

`html`, `js` and `other` allow you to transform incoming data, while responses
is a shortcut to return fixed responses to requests containing the url. Note
that the original request is still sent, and the fake responses contains the
original request's status code and headers. You can temporarily disable `html`
and `js` transformations by appending `proxypass=true` to the URL querystring.

To keep the API simple, this is a caching proxy, i.e. it does not stream responses,
it only forwards data when the request has been full downloaded from the server.

There is currently no support for stopping/cleanup.
