var rimraf = require('rimraf');
var fs = require('fs');

var appConfig = require('./../appconfig.json');

var getRepositoryLocation = function() {
    return __dirname + "/.." + appConfig.clonePath;
};

var clearRepository = function(requestId) {
    var repositoryLocation = getRepositoryLocation() + requestId;
    if(fs.existsSync(repositoryLocation)) {
        rimraf.sync(repositoryLocation);
    }
};

module.exports = {
    getRepositoryLocation: getRepositoryLocation,
    clearRepository: clearRepository
};