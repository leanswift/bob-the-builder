var fs = require('fs');
var Q = require('q');
var editJsonFile = require('edit-json-file');
var zipdir = require('zip-dir');
var readline = require('readline');
var rimraf = require('rimraf');
var glob  = require('glob');
var tsc = require('typescript-compiler');

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
                            .then((data) => {
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

var getIndex = function(config, parameters) {
    var keys = [];
    parameters.forEach((item, index) => {
        keys[index] = item.requestKey;
    });
    return keys.indexOf(config);
};

var configureValue = function(customization, requestId, value) {
    var filePath = fileUtil.getRepositoryLocation() + requestId + '/' + customization.location + '/' + customization.fileName;
    var editFile = editJsonFile(filePath);
    editFile.set(customization.key, value);
    editFile.save();
};

var runTypeScriptCompiler = function(module, requestId) {
    var repositoryPath = fileUtil.getRepositoryLocation() + requestId + '/' + module.repository;
    return new Promise((fulfilled, rejected) => {
        glob(repositoryPath + '/scripts/**/*.ts', (err, matches) => {
            if(err) {
                rejected(err);
            }
            fulfilled(matches);
        });
    })
    .then(matches => {
        tsc.compile(matches, ['--out', repositoryPath + '/out.js']);
    });
};

var removeIgnoredFiles = function(module, requestId) {
    var repositoryPath = fileUtil.getRepositoryLocation() + requestId + '/' + module.repository;
    return new Promise((fulfilled, rejected) => {
        var ignoredFiles = [];
        if(fs.existsSync(repositoryPath + '/.bobignore')) {
            var r1 = readline.createInterface({
                input: fs.createReadStream(repositoryPath + '/.bobignore'),
                crlfDelay: Infinity
            });
            r1.on('line', line => {
                ignoredFiles.push(line);
            });
        }
        fulfilled(ignoredFiles);
    })
    .then(ignoredFiles => {
        ignoredFiles.forEach(ignoredFile => {
            if(fs.existsSync(ignoredFile)) {
                rimraf.sync(ignoredFile);
            }
        });
    });
};

module.exports = {
    getVersions: getVersions,
    getCustomizables: getCustomizables,
    download: download
};