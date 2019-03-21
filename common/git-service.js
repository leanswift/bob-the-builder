var nodegit = require('nodegit');
var appConfig = require('./../appconfig.json');

var cloneAndCheckout = function(module, requestId) {
    var opts = {
        fetchOpts: {
            callbacks: {
                certificateCheck: function() {
                    return 1;
                },
                credentials: function(url, userName) {
                    return nodegit.Cred.sshKeyNew(userName, appConfig.sshPublicKeyPath, appConfig.sshPrivateKeyPath, "");
                }
            }
        }
    };
    var repo;
    var commit;
    if(typeof module.branch != 'undefined' && module.branch !== null) {
        opts.checkoutBranch = module.branch;
        return nodegit.Clone(appConfig.gitUrl + module.name + ".git", __dirname + '/..' + appConfig.clonePath + requestId + '/' + module.name, opts)
            .then(function(gitRepo) {
                repo = gitRepo;
                return repo.getBranch('remotes/origin/'+ module.branch);                    
            })
            .then(function(reference) {
                return repo.checkoutRef(reference);
            })
            .catch(function(err) {
                console.error(err.message);
                throw err;
            });
    } else {
        return nodegit.Clone(appConfig.gitUrl + module.name + ".git", __dirname + '/..' + appConfig.clonePath + requestId + '/' + module.name, opts)
            .then(function(gitRepo) {
                        repo = gitRepo;
                console.log("Finished cloning %s", module.name);
                return nodegit.Tag.list(repo);
            })
            .then(function(array){
                return repo.getReferenceCommit(module.tag);
            })
            .then(function(refCommit) {
                        commit = refCommit;
                return nodegit.Checkout.tree(repo, commit, { checkoutStrategy: nodegit.Checkout.SAFE });
            })
            .then(function(){
                return repo.setHeadDetached(commit, repo.defaultSignature, "Checkout: HEAD" + commit);
            })
            .then(function(){
                return nodegit.Reset.reset(repo, commit, nodegit.Reset.TYPE.HARD,{checkoutStrategy: nodegit.Checkout.SAFE}, module.branch);
            })
            .catch(function(err) {
                 console.error(err.message);
                 throw err;
            });
    }    
};

module.exports = {
    cloneAndCheckout: cloneAndCheckout
};