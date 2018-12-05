var fs = require('fs');
var Q = require('q');
var S = require('string');
var prop = require('properties-parser');
var editJsonFile = require('edit-json-file');
var cleanDeep = require('clean-deep');

var fileUtil = require('./../util/file-util');
var gitService = require('./../common/git-service');
var mavenService = require('../common/maven-service');

var BUILD_FILE_PATH = __dirname + "/eLink-build.json";

/**
 * Lists versions of elink available for download
 * 
 * 
 */
var getVersions = function() {
    return new Promise(function(fulfilled, rejected) {
        fs.readFile(BUILD_FILE_PATH, "utf-8", function(err, data) {
            if(err) {
                rejected(err);
            }
            var json = JSON.parse(data);
            var versions = [];
            if (Object.keys(json).length === 0 && json.constructor === Object) {
                return;
            } else {
                json.eLinkBuilds.forEach(function(item, index) {
                    versions[index] = item.version;
                });
            }
            fulfilled(versions);
        });
    });
};

/**
 * Lists parameters which can be customized for a specified elink version
 * 
 * @param {string} version 
 */
var getCustomizables = function(version) {
    return new Promise(function(fulfilled, rejected) {
        fs.readFile(BUILD_FILE_PATH, "utf-8", function(err, data) {
            if(err) {
                rejected(err);
            }
            var customizables = [];
            var json = JSON.parse(data);
            json.eLinkBuilds.forEach(function(item, index) {
                if(item.version == version){
                    item.parameters.forEach(function(item, index){
                        customizables[index] = {};
                        customizables[index].name = item.name;
                        customizables[index].key = item.requestKey;
                    });
                }
            });
            fulfilled(customizables);
        });
    });
};

var removeVersion = version => {
    return new Promise((fulfilled, rejected) => {
        fs.readFile(BUILD_FILE_PATH, "utf-8", function(err, data) {
            if(err) {
                rejected(err);
            }
            fulfilled(data);
        })
    })
    .then(data => {
        return new Promise((innerFulfilled, innerRejected) => {
            try {
                var json = JSON.parse(data);
                json.eLinkBuilds.forEach(function(item, index) {
                    if(item.version === version) {
                        delete json.eLinkBuilds[index];
                    }
                });
                fs.writeFile(BUILD_FILE_PATH, JSON.stringify(cleanDeep(json)), function(err) {
                    if(err) throw err;
                });   
                innerFulfilled();
            } catch (error) {
                innerRejected(error);
            }
        });
    });
}

/**
 * Returns a file which is the result of applying the customizations
 * 
 * @param {string} version 
 * @param {string} requestId 
 * @param {array} customizations 
 */
var download = function(version, requestId, customizations) {
    fileUtil.clearRepository();
    return new Promise(function(fulfilled, rejected) {
            fs.readFile(BUILD_FILE_PATH, "utf-8", function(err, data) {
                if(err) {
                    rejected(err);
                }
                fulfilled(data);
            })
        })
        .then(function(data) {
            var json = JSON.parse(data);
            return new Promise(function(innerFulfilled, innerRejected) {
                json.eLinkBuilds.forEach(function(item, index) {
                    if(item.version == version) {
                        var promise = Q.all(item.modules.map((module) => { return gitService.cloneAndCheckout(module, requestId); }));
                        promise
                            .then(() => {
                                customizations.forEach((customization) => {
                                    var indexOfConfig = getIndex(customization.key, item.parameters);
                                    if(indexOfConfig > -1) {
                                        configureValue(item.parameters[indexOfConfig], requestId, customization.value);
                                    } else {
                                        throw Error('The property ' + customization.key + ' is not configurable');
                                    }
                                });
                            })
                            .then((results) => {
                                item.modules.forEach((module) => {
                                    promise = promise.then(() => mavenService.package(module.name, requestId));
                                });
                                return promise;
                            })
                            .then(() => {
                                var warPath = getWarPath(item.modules[item.modules.length -1].name, requestId);
                                if(warPath == null) {
                                    throw Error("Could not find war file in web module");
                                } else {
                                    innerFulfilled(warPath);
                                }
                            })
                            .catch((error) => {
                                innerRejected(error);
                            });
                    }
                });
            });
        });
};

var addBuild = function(build) {
    const buildFilePath = __dirname + "/eLink-build.json";
    return new Promise((resolve, reject) => {
        if(!fs.existsSync(buildFilePath)) {
            reject(Error('eLink-build.json is missing'));
        }
        try {
            buildJson = editJsonFile(buildFilePath);
            let eLinkBuilds = buildJson.get('eLinkBuilds');
            validateModule(eLinkBuilds, build);
            eLinkBuilds[eLinkBuilds.length] = build;
            buildJson.set('eLinkBuilds', eLinkBuilds);
            buildJson.save();
            resolve();
        } catch(err) {
            reject(err);
        }
    });
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
* Edits properties file
*/
var configureValue = function(configuration, requestId, value) {
	if(configuration.type === 'properties') {
		var fileEditor = prop.createEditor(fileUtil.getRepositoryLocation() + requestId + '/' + configuration.location + '/' + configuration.fileName);
		fileEditor.set(configuration.key, value);
		fileEditor.save();
	} else if(configuration.type === 'regex') {
		fs.readFile(fileUtil.getRepositoryLocation() + requestId + '/' + configuration.location + '/' + configuration.fileName, (err, data) => {
			if(err) console.log(err);
			console.log("Contents of file: " + data);
			console.log("Regex: " + new RegExp(configuration.expression));
			if(typeof value !== 'undefined' && value !== null && value.length > 0) {
				var result = data.toString().replace(new RegExp(configuration.expression), value);
				fs.writeFile(fileUtil.getRepositoryLocation() + requestId + '/' + configuration.location + '/' + configuration.fileName, result, 'utf8', function (err) {
					if (err) return console.log(err);
				});
			}
		});
	} else {
        console.error("Unsupported customization type '" + configuration.type + "'");
        throw Error("Unsupported customization type '" + configuration.type + "'");
	}
};

/**
* Function which accepts a directory name and returns a file name which
* has .war extension in it.
*/
var getWarPath = function(moduleName, requestId) {
	var warDir = fileUtil.getRepositoryLocation() + requestId + '/' + moduleName + '/target/';
	var filePath = null;
	fs.readdirSync(warDir).forEach((name) => {
		if(S(name).endsWith('.war')) {
			filePath = warDir + '/' + name;
		}
	});
	return filePath;
};

var validateModule = function(eLinkBuilds, module) {
	eLinkBuilds.forEach((build) => {
		if(build.version === module.version) {
			throw new Error('Build already exists in eLink-build.json');
		}
	});
};

module.exports = {
    getVersions: getVersions,
    getCustomizables: getCustomizables,
    download: download,
    addBuild: addBuild,
    removeVersion: removeVersion
};