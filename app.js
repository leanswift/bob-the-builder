var express = require('express');
var cors = require('cors');
var app = express();
var bodyParser = require('body-parser');
var fs = require('fs');
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
// app.use(errorHandler);

/**
* Service to get list of versions of eLink which can be downloaded
*/
app.get('/:service/versions', function(req, res, next) {
	var response = {};
	var service = serviceMapper.resolveService(req.params.service);
	service.getVersions().then((result) => {
		response.versions = result;
		res.end(JSON.stringify(response));
	})
	.catch(function(err) {
		next(err);
	});
});

/**
* Service to get list of customizables for selected version of eLink
*/
app.get('/:service/:version/customizables', function(req, res, next) {
	var response = {};
	var service = serviceMapper.resolveService(req.params.service);
	service.getCustomizables(req.params.version).then(function(result) {
		response.customizables = result;
		res.end(JSON.stringify(response));
	})
	.catch(function(err) {
		next(err);
	});
});

/**
* Service to download a given version of eLink
*/
app.post('/:service/:version/download', function(req, res, next) {
	var requestId = uniqid();
	var service = serviceMapper.resolveService(req.params.service);
	service.download(req.params.version, requestId, req.body.configurations)
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

app.post('/versions', expressJoi(configSchema), function(req, res, next) {
	let buildConfigurations = JSON.parse(fs.readFileSync(__dirname + "/eLink-build.json", "utf-8").toString());
	let eLinkBuilds = buildConfigurations.eLinkBuilds;
	try {
		validateModule(eLinkBuilds, req.body);
		eLinkBuilds[eLinkBuilds.length] = req.body;
		fs.writeFile(__dirname + "/eLink-build.json", JSON.stringify({ eLinkBuilds: eLinkBuilds }));
		res.status(200).send({
			message: "Added new configuration"
		});
	} catch (err) {
		res.status(400).send({ message: err.message });
	}
});

app.use(errorHandler);

var validateModule = function(eLinkBuilds, module) {
	eLinkBuilds.forEach((build) => {
		if(build.version === module.version) {
			throw new Error('Build already exists in eLink-build.json');
		}
	});
};

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
