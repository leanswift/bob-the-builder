var eLinkService = require('./eLink/eLink-service');
var h5Service = require('./h5/h5-service');

var resolveService = function(serviceName) {
    var service = serviceMap[serviceName];
    verifyService(service);

    return service;
};

var verifyService = function(service) {
    if(typeof service.getVersions !== 'function') {
        throw Error("getVersions() is not implemented in " + service);
    }
    if(typeof service.getCustomizables !== 'function') {
        throw Error("getCustomizables() is not implemented in " + service);
    }
    if(typeof service.download !== 'function') {
        throw Error("download() is not implemented in " + service);
    }
    if(typeof service.addBuild !== 'function') {
        throw Error("addBuild() is not implemented in " + service);
    }
    // if(typeof service.getBuildConfiguration !== 'function') {
    //     throw Error("getBuildConfiguration() is not implemented in " + service)
    // }
};

var serviceMap = {
    eLink: eLinkService,
    h5: h5Service
};

module.exports = {
    resolveService: resolveService
};