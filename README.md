# addon-proxy

Provides a clean API for Firefox addon-sdk extensions to modify incoming HTTP
responses. To begin modifying responses, just call `rewrite({...})` and pass an
object with the optional properties `html`, `js`, `other`.

In addition, the argument can have a `responses` property, which is a
shorthand to return pre-computed responses if the requested URL contains the
provided pattern (but note that the original request is still sent, and the
response maintains the original response's status code and headers).

## Usage

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

You can temporarily disable `html` and `js` transformations for a particular
response by appending `proxypass=true` to the URL querystring.

To keep the API simple, this is a caching proxy, i.e. it does not stream responses,
it only forwards data when the request has been fully downloaded from the server.
