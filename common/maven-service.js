var maven = require('maven');

var fileUtil = require('./../util/file-util');

var runMavenBuild = function(repo, requestId) {
    var mvn = maven.create({
		cwd: fileUtil.getRepositoryLocation() + requestId + '/' + repo
	});
	return mvn.execute(['clean', 'install']);
};

module.exports = {
    package: runMavenBuild
}