var path = require('path');
var express = require('express');
var app = express();
var fs = require('fs');
var nodegit = require('nodegit');
var parseString = require('xml2js').parseString;
var maven = require('maven');
var Q = require('q');
var prop = require('properties-parser');
var localPath = path.join.bind(path,__dirname);
var Checkout = nodegit.Checkout;
var Tag = nodegit.Tag;
var Reset = nodegit.Reset;

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

app.get('/:version/download', function(req, res) {
	fs.readFile(__dirname + "/eLink-build.json", "utf-8", function(err, data) {
		var json = JSON.parse(data);
		var git_url = "git@github.com:leanswift/";
		var sshPublicKeyPath = localPath("../id_rsa.pub");
		var sshPrivateKeyPath = localPath("../id_rsa");
		var clonePath = localPath("../repos/clone/");
		//var buildDir = localPath("../repos/build");
		//var reposPath = localPath("../repos/clone/workdir");


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
		var xml;

		var deferred = Q.defer();

		var gitCheckoutfunction = function(){
			json.eLinkBuilds.forEach(function(item, index){
				if(item.version == req.params.version){
					item.modules.forEach(function(item, index){
						repo = nodegit.Clone(git_url+item.repository+".git", clonePath+item.repository, opts).then(function(repo) {
							console.log("Repository cloning done");
							Tag.list(repo).then(function(array){
								return repo.getReferenceCommit(item.branch);
							}).then(function(commit) {
								console.log("get commit done");
								Checkout.tree(repo, commit, { checkoutStrategy: Checkout.SAFE}).then(function(){
									repo.setHeadDetached(commit, repo.defaultSignature, "Checkout: HEAD" + commit);
								}).then(function(){
									Reset.reset(repo,commit,Reset.TYPE.HARD,{checkoutStrategy: Checkout.SAFE},item.branch);
									console.log("Checkout done");
								}).catch(function(err){
									console.log(err.message, "after checkout"+item.repository);
								});
							}).catch(function(err){
								console.log(err.message, "after getting commit"+item.repository );
							});
						}).catch(function(err) {
							console.log(err.message);
						}).done(function(){
							console.log("finished");
						});
					});
				}
			});
		};

		var xmlEditorFunction = function() {
			json.eLinkBuilds.forEach(function(item, index){
				if(item.version == req.params.version){
					item.parameters.forEach(function(item, index) {
						var editor = prop.createEditor(clonePath + item.location + item.fileName);
						editor.set(item.key, item.value);
						console.log("inside editor", editor.toString());
						editor.save();
					});
				}
			});
		}

		var mavenBuildfunction = function() {
			json.eLinkBuilds.forEach(function(item, index){
				if(item.version == req.params.version){
					item.modules.forEach(function(item, index){
						//deferred.resolve(function(){
							var mvn = maven.create({
							cwd: clonePath + item.repository
						});
						mvn.execute(['clean', 'install']).then(function(result){
							deferred.resolve(result);
							console.log("build success");
						}).catch(function(err){
							console.log(err);
						});
					//});
					return deferred.promise;
					});
				}
			});
		}

		function promiseForGitfunction() {
			deferred.resolve(gitCheckoutfunction());

			return deferred.promise;
		}
		promiseForGitfunction().then(function(result){
			deferred.resolve(xmlEditorFunction());

			return deferred.promise;
		}).then(function(){
			mavenBuildfunction();
		})



		//	json.eLinkBuilds.forEach(function(item, index) {
		//			if(item.version == req.params.version) {
		// 	item.modules.forEach(function(item, index){
		// 		modules.modules[index] = {};
		// 		modules.modules.repository = item.repository;
		// 		modules.modules.branch = item.branch;
		// 		repo = nodegit.Clone(git_url+item.repository+".git", clonePath+item.repository, opts).then(function(repo) {
		// 			console.log("Repository cloning done");
		// 			Tag.list(repo).then(function(array){
		// 				return repo.getReferenceCommit(item.branch);
		// 			}).then(function(commit) {
		// 				console.log("get commit done");
		// 				Checkout.tree(repo, commit, { checkoutStrategy: Checkout.SAFE}).then(function(){
		// 					repo.setHeadDetached(commit, repo.defaultSignature, "Checkout: HEAD" + commit);
		// 				}).then(function(){
		// 					Reset.reset(repo,commit,Reset.TYPE.HARD,{checkoutStrategy: Checkout.SAFE},item.branch);
		// 					console.log("Checkout done");
		// 				}).catch(function(err){
		// 					console.log(err.message, "after checkout"+item.repository);
		// 				});
		// 			}).catch(function(err){
		// 				console.log(err.message, "after getting commit"+item.repository );
		// 			});
		// 		}).catch(function(err) {
		// 			console.log(err.message);
		// 		}).done(function(){
		// 			console.log("finished");
		// 	});
		// });

		// 	item.parameters.forEach(function(item, index) {
		// 		customizables.customizables[index] = {};
		// 		customizables.customizables.key = item.key;
		// 		customizables.customizables.value = item.value;
		// 		customizables.customizables.fileName = item.fileName;
		// 		customizables.customizables.location = item.location;
		// 	//XML EDITOR
		// 	// fs.readFile(clonePath + item.location + item.fileName, "utf-8", function(err, data){
		// 	// 	if(err){
		// 	// 		console.log(err);
		// 	// 	}
		// 	// 	var jsonforXML;
		// 	// 	parseString(data, function(err, result) {
		// 	// 		if (err) {
		// 	// 			console.log(err);
		// 	// 		}
		// 	// 		jsonforXML = result;
		// 	// 	//
		// 	// 	});
		// 	// 	// jsonforXML.beans.bean.forEach(function(item, index) {
		// 	// 	// 	if (item.$.id == "h2WebServer") {
		// 	// 	// 		jsonforXML.beans.bean.splice(1, index);
		// 	// 	// 	}
		// 	// 	// });
		// 	// 	console.log(JSON.stringify(jsonforXML));
		// 	// });
		// 	//properties EDITOR
		// 	var editor = prop.createEditor(clonePath + item.location + item.fileName);
		// 	console.log(editor.toString());
		// });
		//	}
		//});
		//MAVEN BUILD
		// var mvn = maven.create({
		// 	cwd: clonePath + "eLink-CE"
		// });
		// mvn.execute(['clean', 'install']).then(function(){
		// 	console.log("build success");
		// }).catch(function(err){
		// 	console.log(err);
		// });
	})
});

var server = app.listen(8888, "127.0.0.1", function() {
	var host = server.address().address;
	var port = server.address().port;

	console.log("eLink builder running at http://%s:%s", host, port)
});
