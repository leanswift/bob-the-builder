var path = require('path');
var express = require('express');
var app = express();
var fs = require('fs');
var nodegit = require('nodegit');
var maven = require('maven');
var Q = require('q');

/**
* Service to get list of versions of eLink which can be downloaded
*/
app.get('/versions', function(req, res) {
	fs.readFile(__dirname + "/eLink-build.json", "utf-8", function(err, data) {
		var json = JSON.parse(data);
		var versions = {
			versions: []
		};
		json.eLinkBuilds.forEach(function(item, index) {
			versions.versions[index] = item.version;
		});
		console.log(path.dirname);
		res.end(JSON.stringify(versions));
	})
});

/**
* Service to get list of customizables for selected version of eLink
*/
app.get('/:version/customizables', function(req, res) {
	fs.readFile(__dirname + "/eLink-build.json", "utf-8", function(err, data) {
		var json = JSON.parse(data);
		var customizables = {
			customizables: []
		};
		json.eLinkBuilds.forEach(function(item, index) {
			if(item.version == req.params.version){
				item.parameters.forEach(function(item, index){
					customizables.customizables[index] = {};
					customizables.customizables[index].name = item.name;
					customizables.customizables[index].key = item.requestKey;
				});
			}
		});

		res.end(JSON.stringify(customizables));
	})
});

/**
* Service to download a given version of eLink
*/
app.get('/:version/download', function(req, res) {
  fs.readFile(__dirname + "/eLink-build.json", "utf-8", function(err, data) {
    var json = JSON.parse(data);
    json.eLinkBuilds.forEach(function(item, index) {
      if(item.version == req.params.version) {
				var promise = Q.all(item.modules.map(cloneAndCheckout));
				promise
		      .then((results) => {
						item.modules.forEach((module) => {
							promise = promise.then(() => runMavenBuild(module.name));
						});
						return promise;
					})
		      .then((results) => console.log('done'))
					.catch((error) => console.log(error));
      }
    });
  });
});

/**
* Function which accepts a repoName and a tag/branch name and then clones it
* from git and checks out the tag.
*/
var cloneAndCheckout=  function(module) {
  var gitUrl = "git@github.com:leanswift/";
  var clonePath = __dirname + "/repos/";
  var sshPublicKeyPath = "/home/shyam/.ssh/id_rsa_work.pub";
  var sshPrivateKeyPath = "/home/shyam/.ssh/id_rsa_work";
  var opts = {
    fetchOpts: {
      callbacks: {
        certificateCheck: function() {
          return 1;
        },
        credentials: function(url, userName) {
          return nodegit.Cred.sshKeyNew(userName, sshPublicKeyPath, sshPrivateKeyPath, "");
        }
      }
    }
  };
	var repo;
	var commit;

	return nodegit.Clone(gitUrl + module.name + ".git", clonePath + module.name, opts)
	        .then(function(gitRepo) {
						repo = gitRepo;
	          console.log("Finished cloning %s", module.name);
	          return nodegit.Tag.list(repo);
	        })
	        .then(function(array){
	          return repo.getReferenceCommit(module.branch);
	        })
	        .then(function(refCommit) {
						commit = refCommit;
	          return nodegit.Checkout.tree(repo, commit, { checkoutStrategy: nodegit.Checkout.SAFE });
	        })
	        .then(function(){
	          return repo.setHeadDetached(commit, repo.defaultSignature, "Checkout: HEAD" + commit);
	        })
	        .then(function(){
	            return nodegit.Reset.reset(repo, commit, nodegit.Reset.TYPE.HARD,{checkoutStrategy: nodegit.Checkout.SAFE}, module.branch);
	        })
	        .catch(function(err) {
	          console.log(err.message);
	        });
}

/**
* A function which runs `mvn clean install` on the root directory of given repository
*/
var runMavenBuild = function(repo) {
	var mvn = maven.create({
		cwd: __dirname + "/repos/" + repo
	});
	return mvn.execute(['clean', 'install']);
}

/**
* Node server initialization
*/
var server = app.listen(8888, "127.0.0.1", function() {
	var host = server.address().address;
	var port = server.address().port;

	console.log("eLink builder running at http://%s:%s", host, port)
});
