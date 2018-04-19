var path = require('path');
var express = require('express');
var cors = require('cors');
var app = express();
var bodyParser = require('body-parser');
var fs = require('fs');
var nodegit = require('nodegit');
var maven = require('maven');
var Q = require('q');
var S = require('string');
var appConfig = require('./appconfig.json');
var prop = require('properties-parser');
var rimraf = require('rimraf');
var uniqid = require('uniqid');

app.use(bodyParser.json());
app.use(cors());

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
app.post('/:version/download', function(req, res) {
	var requestId = uniqid();
	if(fs.existsSync(__dirname + appConfig.clonePath + requestId)) {
		console.log("Removing %s", __dirname + appConfig.clonePath + requestId);
		rimraf.sync(__dirname + appConfig.clonePath + requestId);
	}
  fs.readFile(__dirname + "/eLink-build.json", "utf-8", function(err, data) {
    var json = JSON.parse(data);
    json.eLinkBuilds.forEach(function(item, index) {
      if(item.version == req.params.version) {
				var promise = Q.all(item.modules.map((module) => { return cloneAndCheckout(module, requestId); }));
				promise
					.then(() => {
						req.body.configurations.forEach((configuration) => {
							var indexOfConfig = getIndex(configuration.key, item.parameters);
							if(indexOfConfig > -1) {
								configureValue(item.parameters[indexOfConfig], requestId, configuration.value);
							} else {
								throw new Error('The property ' + configuration.key + ' is not configurable');
							}
						});
					})
		      .then((results) => {
						item.modules.forEach((module) => {
							promise = promise.then(() => runMavenBuild(module.name, requestId));
						});
						return promise;
					})
		      .then(() => {
						var warPath = getWarPath(item.modules[item.modules.length -1].name, requestId);
						if(warPath == null) {
							var errorResponse = {
								message: "Could not find war file in web module"
							};
							res.write(errorResponse);
						} else {
							res.download(warPath, null, (err) => {
								rimraf.sync(__dirname + appConfig.clonePath + requestId);
							});
						}
					})
					.catch((error) => {
						console.log(error);
						var errorResponse = {
							error: error,
							message: "Build failed"
						};
						res.write(errorResponse);
					});
      }
    });
  });
});

/**
* Edits properties file
*/
var configureValue = function(configuration, requestId, value) {
	if(configuration.type === 'properties') {
		var fileEditor = prop.createEditor(__dirname + appConfig.clonePath + requestId + '/' + configuration.location + '/' + configuration.fileName);
		fileEditor.set(configuration.key, value);
		fileEditor.save();
	} else if(configuration.type === 'regex') {
		fs.readFile(__dirname + appConfig.clonePath + requestId + '/' + configuration.location + '/' + configuration.fileName, (err, data) => {
			if(err) console.log(err);
			console.log("Contents of file: " + data);
			console.log("Regex: " + new RegExp(configuration.expression));
			if(typeof value !== 'undefined' && value !== null && value.length > 0) {
				var result = data.toString().replace(new RegExp(configuration.expression), value);
				fs.writeFile(__dirname + appConfig.clonePath + requestId + '/' + configuration.location + '/' + configuration.fileName, result, 'utf8', function (err) {
					if (err) return console.log(err);
				});
			}
		});
	} else {
		console.error("Unsupported file type '" + configuration.type + "'");
	}
};

/**
* Gets the index of customizable for a given customizable key
*/
var getIndex = function(config, parameters) {
	var keys = [];
	parameters.forEach((item, index) => {
		keys[index] = item.requestKey;
	});
	return keys.indexOf(config);
};

/**
* Function which accepts a directory name and returns a file name which
* has .war extension in it.
*/
var getWarPath = function(moduleName, requestId) {
	var warDir = __dirname + appConfig.clonePath + requestId + '/' + moduleName + '/target/';
	var filePath = null;
	fs.readdirSync(warDir).forEach((name) => {
		if(S(name).endsWith('.war')) {
			filePath = warDir + '/' + name;
		}
	});
	return filePath;
};

/**
* Function which accepts a repoName and a tag/branch name and then clones it
* from git and checks out the tag.
*/
var cloneAndCheckout = function(module, requestId) {
  var opts = {
    fetchOpts: {
      callbacks: {
        certificateCheck: function() {
          return 1;
        },
        credentials: function(url, userName) {
          return nodegit.Cred.sshKeyNew(userName, appConfig.sshPublicKeyPath, appConfig.sshPrivateKeyPath, "");
        }
      }
    }
  };

	if(typeof module.branch != 'undefined' && module.branch !== null) {
		opts.checkoutBranch = module.branch;
	}

	var repo;
	var commit;

	return nodegit.Clone(appConfig.gitUrl + module.name + ".git", __dirname + appConfig.clonePath + requestId + '/' + module.name, opts)
	        .then(function(gitRepo) {
						repo = gitRepo;
	          console.log("Finished cloning %s", module.name);
	          return nodegit.Tag.list(repo);
	        })
	        .then(function(array){
	          return repo.getReferenceCommit(module.tag);
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
};

/**
* A function which runs `mvn clean install` on the root directory of given repository
*/
var runMavenBuild = function(repo, requestId) {
	var mvn = maven.create({
		cwd: __dirname + appConfig.clonePath + requestId + '/' + repo
	});
	return mvn.execute(['clean', 'install']);
}

/**
* Node server initialization
*/
var server = app.listen(8888, "", function() {
	var host = server.address().address;
	var port = server.address().port;

	console.log("eLink builder running at http://%s:%s", host, port)
});
