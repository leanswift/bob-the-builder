var path = require('path');
var express = require('express');
var app = express();
var fs = require('fs');
var nodegit = require('nodegit');
var parseString = require('xml2js').parseString;
var maven = require('maven-deploy');
var localPath = path.join.bind(path,__dirname);
var Checkout = nodegit.Checkout;
var Tag = nodegit.Tag;

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
		var modules = {
				modules: []
		};
		var customizables = {
			customizables: []
		};
		var repo;
		var xml;
		json.eLinkBuilds.forEach(function(item, index) {
			if(item.version == req.params.version) {
				item.parameters.forEach(function(item, index) {
					customizables.customizables[index] = {};
					customizables.customizables.key = item.key;
					customizables.customizables.fileName = item.fileName;
					customizables.customizables.location = item.location;
				});
				//XML EDITOR
				// fs.readFile(__dirname + "/eLink-mp-context.xml", "utf-8", function(err, data){
				// 	if(err){
				// 		console.log(err);
				// 	}
				// 	var jsonforXML;
				// 	parseString(data, function(err, result) {
				// 		if (err) {
				// 			console.log(err);
				// 		}
				// 		jsonforXML = result;
				// 	//
				// 	});
				// 	jsonforXML.beans.bean.forEach(function(item, index) {
				// 		if (item.$.id == "h2WebServer") {
				// 			jsonforXML.beans.bean.splice(1, index);
				// 		}
				// 	});
				// 	console.log(JSON.stringify(jsonforXML));
				// });
				//GIT
				item.modules.forEach(function(item, index){
					modules.modules[index] = {};
					modules.modules.repository = item.repository;
					modules.modules.branch = item.branch;
				repo = nodegit.Clone(git_url+item.repository.toString()+".git", clonePath+item.repository.toString(), opts).then(function(repo) {
					console.log("Repository cloning done");
						  Tag.list(repo).then(function(array){
						 							return repo.getReferenceCommit(item.branch.toString());
												}).then(function(commitSha) {
						 							repo.getCommit(nodegit.Oid.fromString(commitSha.id().toString())).then(function(commit){
						 								console.log("get commit done");
						 								Checkout.tree(repo, commit, { checkoutStrategy: Checkout.STRATEGY.USE_THEIRS}).then(function(){
						 													 		//repo.setHeadDetached(commit, repo.defaultSignature, "Checkout: HEAD" + commit);
																			 console.log("Checkout done");
						 										 }).catch(function(err){
						 											 console.log(err.message, "after checkout"+item.repository);
						 										 });
						 							}).catch(function(err){
						 								console.log(err.message, "after getting commit"+item.repository );
						 							});
												}).catch(function(err){
						 							console.log(err.message, "after getting reference"+item.repository);
											});
				}).catch(function(err) {
					console.log(err.message);
				});
			});
			//MAVEN build
			// var config = {
			// 	"groupId" 		: "com.leanswift",
			// 	"artifactId"	: "eLink-parent",
			// 	"buildDir"		: clonePath.toString(),
			// 	"finalName"		: "eLink-parent",
			// 	"type"				: "jar",
			// 	"fileEncoding": "utf-8",
			// 	"pomFile"			: "pom.xml",
			// 	"repositories": [
			// 		{
			// 			"id" : "thirdparty.leanswift",
			// 			"url": "http://maven.leanswift.net:3434/artifactory/thirdparty.leanswift"
			// 		},
			// 		{
			// 			"id" : "leanswift.releases",
			// 			"url": "http://maven.leanswift.net:3434/artifactory/leanswift.releases"
			// 		},
			// 		{
			// 			"id" : "leanswift.snapshots",
			// 			"url": "http://maven.leanswift.net:3434/artifactory/leanswift.snapshots"
			// 		}
			// 	]
			// };
			// maven.config(config);
			// maven.install();
			}
		});
	})
});

var server = app.listen(5858, "127.0.0.1", function() {
	var host = server.address().address;
	var port = server.address().port;

	console.log("eLink builder running at http://%s:%s", host, port)
});
