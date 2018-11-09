var fs = require('fs');
var Q = require('q');

var gitService = require('./../common/git-service');
var fileUtil = require('./../util/file-util');

var BUILD_FILE_PATH = __dirname + '/h5-build.json';

var getVersions = () => {
    return new Promise((fulfilled, rejected) => {
        fs.readFile(BUILD_FILE_PATH, 'utf-8', (err, data) => {
            if(err) {
                rejected(err);
            }
            fulfilled(data);
        });
    })
    .then((data) => {
        var versions = [];
        var json = JSON.parse(data);
        json.h5Builds.forEach(element => {
            versions.push(element.version);
        });
        return versions;
    });
};

var getCustomizables = version => {
    return new Promise((fulfilled, rejected) => {
        fs.readFile(BUILD_FILE_PATH, 'utf-8', (err, data) => {
            if(err) {
                rejected(err);
            }
            fulfilled(data);
        });
    })
    .then(data => {
        var customizables = [];
        var json = JSON.parse(data);
        json.h5Builds.forEach(function(item, index) {
            if(item.version == version){
                item.parameters.forEach(function(item, index){
                    customizables[index] = {};
                    customizables[index].name = item.name;
                    customizables[index].key = item.requestKey;
                });
            }
        });
        return customizables;
    });
};

var download = function(version, requestId, customizations) {
    fileUtil.clearRepository(requestId);

    return new Promise((fulfilled, rejected) => {
        fs.readFile(BUILD_FILE_PATH, 'utf-8', (err, data) => {
            if(err) {
                rejected(err);
            }
            fulfilled(data);
        })
    })
    .then((data) => {
        return new Promise((innerFulfilled, innerRejected) => {
            var json = JSON.parse(data);
            json.h5Builds.forEach(build => {
                if(build.version === version) {
                    var clonePromise = Q.all(build.modules.map(module => {
                        return gitService.cloneAndCheckout(module, requestId);
                    }));

                    clonePromise.then(results => {
                        customizations.forEach((customization) => {
                            // TODO apply customizations
                        });
                    })
                    .catch(err => {
                        innerRejected(err);
                    });
                }
            });
        });
    });
};

module.exports = {
    getVersions: getVersions,
    getCustomizables: getCustomizables,
    download: download
};