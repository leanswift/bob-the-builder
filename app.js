var express = require('express');
var cors = require('cors');
var app = express();
var bodyParser = require('body-parser');
var fs = require('fs');
var rimraf = require('rimraf');
var uniqid = require('uniqid');
var Joi = require('joi');
var expressJoi = require('express-joi-validator');

var appConfig = require('./appconfig.json');
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
* Service to get list of versions of eLink which can be downloaded
*/
app.get('/:service/versions', function(req, res) {
	var response = {};
	var service = serviceMapper.resolveService(req.params.service);
	service.getVersions().then((result) => {
		response.versions = result;
		res.end(JSON.stringify(response));
	});
});

/**
* Service to get list of customizables for selected version of eLink
*/
app.get('/:service/:version/customizables', function(req, res) {
	var response = {};
	var service = serviceMapper.resolveService(req.params.service);
	service.getCustomizables(req.params.version).then(function(result) {
		response.customizables = result;
		res.end(JSON.stringify(response));
	});
});

/**
* Service to download a given version of eLink
*/
app.post('/:service/:version/download', function(req, res) {
	var requestId = uniqid();
	var service = serviceMapper.resolveService(req.params.service);
	service.download(req.params.version, requestId, req.body.configurations)
		.then(function(result) {
			res.download(result, null, (err) => {
				rimraf.sync(__dirname + appConfig.clonePath + requestId);
			});
		})
		.catch(function(err) {
			throw Error(err);
		});
});

app.post('/versions', expressJoi(configSchema), function(req, res) {
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

var validateModule = function(eLinkBuilds, module) {
	eLinkBuilds.forEach((build) => {
		if(build.version === module.version) {
			throw new Error('Build already exists in eLink-build.json');
		}
	});
};

app.use(function(err, req, res, next) {
	if(err.isBoom) {
		return res.status(err.output.statusCode).json(err.output.payload);
	}
});

/**
* Node server initialization
*/
var server = app.listen(8888, "", function() {
	var host = server.address().address;
	var port = server.address().port;

	console.log("eLink builder running at http://%s:%s", host, port)
});
