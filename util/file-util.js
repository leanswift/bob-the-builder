var appConfig = require('./../appconfig.json');

var getRepositoryLocation = function() {
    return __dirname + "/.." + appConfig.clonePath;
};

module.exports = {
    getRepositoryLocation: getRepositoryLocation
};