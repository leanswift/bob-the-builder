var maven = require('maven');
var appConfig = require('./../appconfig.json');

var runMavenBuild = function(repo, requestId) {
    var mvn = maven.create({
		cwd: __dirname + '/..' + appConfig.clonePath + requestId + '/' + repo
	});
	return mvn.execute(['clean', 'install']);
};

module.exports = {
    package: runMavenBuild
}