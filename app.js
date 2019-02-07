var express = require('express');
var cors = require('cors');
var app = express();
var bodyParser = require('body-parser');
var uniqid = require('uniqid');
var Joi = require('joi');
var expressJoi = require('express-joi-validator');

var fileUtil = require('./util/file-util');
var serviceMapper = require('./service-mapper');

const configSchema = {
	body: {
		version: Joi.string().required(),
		modules: Joi.array().required(),
		parameters: Joi.array().required()
	}
};

app.use(bodyParser.json());
app.use(function (req, res, next) {
	res.setHeader('Content-Type', 'application/json');
	next();
});
app.use(cors());

/**
* Service to get list of versions of the project which can be downloaded
*/
app.get('/:project/versions', function(req, res, next) {
	var response = {};
	var project = serviceMapper.resolveService(req.params.project);
	project.getVersions().then((result) => {
		response.versions = result;
		res.end(JSON.stringify(response));
	})
	.catch(function(err) {
		next(err);
	});
});

/**
* Service to get list of customizables for selected version of the project
*/
app.get('/:project/:version/customizables', function(req, res, next) {
	var response = {};
	var project = serviceMapper.resolveService(req.params.project);
	project.getCustomizables(req.params.version).then(function(result) {
		response.customizables = result;
		res.end(JSON.stringify(response));
	})
	.catch(function(err) {
		next(err);
	});
});

/**
* Service to download a given version of the project
*/
app.post('/:project/:version/download', function(req, res, next) {
	var requestId = uniqid();
	var project = serviceMapper.resolveService(req.params.project);
	project.download(req.params.version, requestId, req.body.configurations)
		.then(function(result) {
			res.download(result, null, (err) => {
				fileUtil.clearRepository(requestId);
			});
		})
		.catch(function(err) {
			console.error(err);
			err = {
				message: 'Build failed. Check the build file for requested build.',
				originalError: err
			};
			fileUtil.clearRepository(requestId);
			next(err);
		});
});

app.post('/:project/versions', expressJoi(configSchema), function(req, res, next) {
	var project = serviceMapper.resolveService(req.params.project);
	project.addBuild(req.body)
		.then(() => {
			res.status(200).send({
				message: "Added new configuration"
			});
		})
		.catch((err) => {
			res.status(400).send({ message: err.message });
		});
});

app.get('/:project/:version/configurations', function(req, res, next) {
	var project = serviceMapper.resolveService(req.params.project);
	project.getBuildConfiguration(req.params.version).then(function (result) {
		res.end(JSON.stringify(result));
	})
	.catch(function(err) {
		next(err);
	});
});

app.put('/:project/:version', function(req, res, next) {
	var project = serviceMapper.resolveService(req.params.project);
	project.updateBuild(req.params.version, req.body)
		.then(function (result) {
			res.end(result)
		})
		.catch(function (err) {
			next(err)
		});
});

app.delete('/:project/:version', function(req, res, next) {
	var project = serviceMapper.resolveService(req.params.project);
	project.removeVersion(req.params.version).then(function (result) {
		res.end(result);
	})
	.catch(function (err) {
		next(err);
	})
});

app.use(errorHandler);

function errorHandler (err, req, res, next) {
	if (res.headersSent) {
		return next(err);
	}
	res.status(500);
	res.send({ error: err });
};

/**
* Node server initialization
*/
var server = app.listen(8888, "", function() {
	var host = server.address().address;
	var port = server.address().port;

	console.log("eLink builder running at http://%s:%s", host, port)
});
