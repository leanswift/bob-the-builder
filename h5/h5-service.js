var fs = require('fs');
var Q = require('q');
var editJsonFile = require('edit-json-file');
var zipdir = require('zip-dir');
var readline = require('readline');
var rimraf = require('rimraf');
var glob  = require('glob');
var cleanDeep = require('clean-deep');

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
        if (Object.keys(json).length === 0 && json.constructor === Object) {
            return;
        } else {
            json.h5Builds.forEach(element => {
                if (element !== null) {
                    versions.push(element.version);   
                }
            });
        }
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
                    customizables[index].defaultValue = item.defaultValue;
                    customizables[index].mandatory = item.mandatory;
                });
            }
        });
        return customizables;
    });
};

var getModuleForVersion = version => {
    return new Promise((fulfilled, rejected) => {
        fs.readFile(BUILD_FILE_PATH, 'utf-8', (err, data) => {
            if (err) {
                rejected(err);
            }
            fulfilled(data);
        });
    })
    .then(data => {
        var modules = [];
        var json = JSON.parse(data);
        json.h5Builds.forEach(function(item, index) {
            if (item.version == version) {
                item.modules.forEach(function(item, index) {
                    modules[index] = {};
                    modules[index].name = item.name;
                    modules[index].version = item.version;
                    modules[index].repository = item.repository;
                    modules[index].tag = item.tag;
                });
            }   
        });
        return modules;
    });
}

var removeVersion = version => {
    return new Promise((fulfilled, rejected) => {
        fs.readFile(BUILD_FILE_PATH, 'utf-8', (err, data) => {
            if (err) {
                rejected(err);
            }
            fulfilled(data);
        });
    })
    .then(data => {
        return new Promise((innerFulfilled, innerRejected) => {
            try {
                var json = JSON.parse(data);                
                json.h5Builds.forEach(function(item, index) {
                    if(item.version === version) {
                        delete json.h5Builds[index];
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

var download = function(version, requestId, customizations) {
    fileUtil.clearRepository(requestId);

    return new Promise((fulfilled, rejected) => {
        fs.readFile(BUILD_FILE_PATH, 'utf-8', (err, data) => {
            if(err) {
                rejected(err);
            }
            fulfilled(data);
        });
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
                            var indexOfConfig = getIndex(customization.key, build.parameters);
                            if(indexOfConfig > -1) {
                                configureValue(build.parameters[indexOfConfig], requestId, customization.value);
                            } else {
                                throw Error('The property ' + customization.key + ' is not configurable');
                            }
                        });
                    })
                    .then((results) => {
                        if(build.modules.length !== 1) {
                            throw Error("H5 applications should contain just one and only one module");
                        } else {
                            var module = build.modules[0];
                            var filePath = fileUtil.getRepositoryLocation() + requestId + '/' + module.repository;
                            var saveFile = filePath + '.zip';
                            runTypeScriptCompiler(module, requestId)
                            .then(() => {
                                return runInitScripts(module, requestId);
                            })
                            .then(() => {
                                return removeIgnoredFiles(module, requestId);
                            })
                            .then((data) => {
                                zipdir(filePath, { saveTo: saveFile }, (err, data) => {
                                    if(err) {
                                        throw err;
                                    }
                                    innerFulfilled(saveFile);
                                });
                            });
                        }
                    })
                    .catch(err => {
                        innerRejected(err);
                    });
                }
            });
        });
    });
};

var addBuild = function(build) {
    const buildFilePath = __dirname + "/h5-build.json";
    return new Promise((resolve, reject) => {
        if(!fs.existsSync(buildFilePath)) {
            reject(Error('h5-build.json does not exist'));
        }
        try {
            buildJson = editJsonFile(buildFilePath);
            let h5Builds = buildJson.get('h5Builds');
            validateModule(h5Builds, build);
            h5Builds[h5Builds.length] = build;
            buildJson.set('h5Builds', h5Builds);
            buildJson.save();
            resolve();
        } catch(err) {
            reject(err);
        }
    });
};

var getIndex = function(config, parameters) {
    var keys = [];
    parameters.forEach((item, index) => {
        keys[index] = item.requestKey;
    });
    return keys.indexOf(config);
};

var configureValue = function(customization, requestId, value) {
    var filePath = fileUtil.getRepositoryLocation() + requestId + '/' + customization.location + '/' + customization.fileName;
    switch(customization.type) {
        case 'json':
            var editFile = editJsonFile(filePath);
            editFile.set(customization.key, value);
            editFile.save();
            break;
        case 'regex':
            // TODO regex editing
        default:
            throw Error('Customization of type ' + customization.type + ' is not supported');
    }
    
};

var runTypeScriptCompiler = function(module, requestId) {
    var repositoryPath = fileUtil.getRepositoryLocation() + requestId + '/' + module.repository;
    return new Promise((fulfilled, rejected) => {
        var exec = require('child_process').exec;
        console.log('Starting tsc on ' + repositoryPath);
        exec('tsc --watch false -p ' + repositoryPath, (error, stdout, stderr) => {
            console.log(stdout);
            console.log(stderr);
            if(error !== null) {
                console.error(error);
            }
            fulfilled();
        });
    });
};

var runInitScripts = function(module, requestId) {
    var repositoryPath = fileUtil.getRepositoryLocation() + requestId + '/' + module.repository;
    return new Promise((resolve, reject) => {
        var scripts = [];
        var bobInitPath = repositoryPath + '/.bobinit';
        var bobInitPath = __dirname + '/.bobinit';
        var input = null;
        if(fs.existsSync(bobInitPath)) {
            input = fs.createReadStream(bobInitPath);
        } else {
            input = fs.createReadStream(defaultBobInitPath)
        }
        var reader = readline.createInterface({
            input: input,
            crlfDelay: Infinity
        });
        reader.on('line', line => {
            var scriptPath = repositoryPath + '/' + line;
            if(fs.existsSync(scriptPath)) {
                scripts.push(line);
            }
        });
        input.on('end', () => {
            resolve(scripts);
        });
    })
    .then((scripts) => {
        var promises = [];
        var exec = require('child_process').exec;
        scripts.forEach(script => {
            var promise = new Promise((resolve, reject) => {
                // TODO move npm install to a separate promise so that it runs only once
                exec('cd ' + repositoryPath + ' && npm install && node ' + script, (error, stdout, stderr) => {
                    console.log('stdout: ' + stdout);
                    console.log('stderr: ' + stderr);
                    if(error !== null) {
                        console.error(error);
                        reject(error);
                    } else {
                        resolve();
                    }
                });
            });
            promises.push(promise);
        });
        return Promise.all(promises);
    });
}

var removeIgnoredFiles = function(module, requestId) {
    var repositoryPath = fileUtil.getRepositoryLocation() + requestId + '/' + module.repository;
    return new Promise((fulfilled, rejected) => {
        var ignoredExpressions = [];
        var defaultBobIgnorePath = __dirname + '/.bobignore';
        var bobIgnorePath = repositoryPath + '/.bobignore';
        var input = null;
        if(fs.existsSync(bobIgnorePath)) {
            input = fs.createReadStream(bobIgnorePath);
        } else {
            input = fs.createReadStream(defaultBobIgnorePath);
        }
        var reader = readline.createInterface({
            input: input,
            crlfDelay: Infinity
        });
        reader.on('line', line => {
            ignoredExpressions.push(line);
        });
        input.on('end', () => {
            fulfilled(ignoredExpressions);
        });
    })
    .then(ignoredExpressions => {
        return listFilePaths(module, ignoredExpressions, requestId)
    })
    .then((data) => {
        var ignoredFiles = flatten(data);
        ignoredFiles.forEach(file => {
            if(fs.existsSync(file)) {
                rimraf(file, (err) => {
                    if(err) {
                        console.log(err);
                    }
                });
            }
        });
    });
};

var listFilePaths = function(module, expressions, requestId) {
    var repositoryPath = fileUtil.getRepositoryLocation() + requestId + '/' + module.repository;
    var promises = [];
    expressions.forEach(expression => {
        var promise = new Promise((resolve, reject) => {
            glob(repositoryPath + '/' + expression, (err, res) => {
                if(err) {
                    reject(err);
                }
                resolve(res);
            });
        });
        promises.push(promise);
    });
    return Promise.all(promises);
};

var validateModule = function(h5Builds, module) {
	h5Builds.forEach((build) => {
		if(build.version === module.version) {
			throw new Error('Build already exists in h5-build.json');
		}
	});
};

var flatten = function(arr) {
    var array = [];
    while(arr.length) {
        var value = arr.shift();
        if(Array.isArray(value)) {
            // this line preserve the order
            arr = value.concat(arr);
        } else {
            array.push(value);
        }
    }
    return array;
};

module.exports = {
    getVersions: getVersions,
    getCustomizables: getCustomizables,
    download: download,
    addBuild: addBuild,
    getModuleForVersion: getModuleForVersion,
    removeVersion: removeVersion
};