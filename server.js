var express = require('express');
var app = express();
var fs = require('fs');

app.get('/versions', function(req, res) {
  fs.readFile(__dirname + "/eLink-build.json", "utf-8", function(err, data) {
    var json = JSON.parse(data);
    var versions = {
      versions: []
    };
    json.eLinkBuilds.forEach(function(item, index) {
      versions.versions[index] = item.version;
    });
    res.end(JSON.stringify(versions));
  })
});

var server = app.listen(5858, "127.0.0.1", function() {
  var host = server.address().address;
  var port = server.address().port;

  console.log("eLink builder running at http://%s:%s", host, port)
});
