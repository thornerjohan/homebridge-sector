var Service, Characteristic;

var pollingtoevent = require("polling-to-event");
const sectoralarm = require('sectoralarm');


module.exports = function(homebridge){
	Service = homebridge.hap.Service;
	Characteristic = homebridge.hap.Characteristic;
	homebridge.registerAccessory("homebridge-sector-securitysystem", "Sector-SecuritySystem", SectorSecuritySystemAccessory);
};

var currentState;

/**
 * The main class acting as the Security System Accessory
 *
 * @param log The logger to use
 * @param config The config received from HomeBridge
 * @constructor
 */
function SectorSecuritySystemAccessory(log, config) {
	var self = this;
	self.log = log;
    self.name = config["name"];
    
    self.email = config.email;
    self.password = config.password;
    self.siteId = config.siteId;
    self.code = config.code;

	// the service
	self.securityService = null;

	// debug flag
    //self.debug = config.debug;
    self.debug = true;

	// polling settings
    self.polling = true;
	self.pollInterval = config.pollInterval || 3000;

	// cached values
	self.previousCurrentState = null;
    self.previousTargetState = null;
    
    self.log("About to initialize.")
    self.init();
}

function translateFromState(log, aState) {
    log.debug("translateFromState() State is " + aState);
    var translatedSate = "UNKNOWN";

    switch (aState) {
        case Characteristic.SecuritySystemTargetState.STAY_ARM:
            translatedSate = "partial";
            break;
        case Characteristic.SecuritySystemTargetState.NIGHT_ARM:
            translatedSate = "partial";
            break;
        case Characteristic.SecuritySystemTargetState.AWAY_ARM:
            translatedSate = "armed";
            break;
        case Characteristic.SecuritySystemTargetState.DISARM:
            translatedSate = "disarmed"
            break;
        case 4:
            translatedSate = "ALARM"
            break;
    };

    return translatedSate
}

function translateToState(log, aState) {

    log.debug("translateToState() State is " + aState);

    // 0 -  Characteristic.SecuritySystemTargetState.STAY_ARM:
    // 1 -  Characteristic.SecuritySystemTargetState.AWAY_ARM:
    // 2-   Characteristic.SecuritySystemTargetState.NIGHT_ARM:
    // 3 -  Characteristic.SecuritySystemTargetState.DISARM:
    var translatedSate = "UNKNOWN";

    switch (String(aState)) {
        case "partialArmed":
            translatedSate = Characteristic.SecuritySystemTargetState.NIGHT_ARM;
            break;
        case Characteristic.SecuritySystemTargetState.NIGHT_ARM:
            translatedSate = "NIGHT_ARM";
            break;
        case "armed":
            translatedSate = Characteristic.SecuritySystemTargetState.AWAY_ARM;
            break;
        case "disarmed":
            translatedSate = Characteristic.SecuritySystemTargetState.DISARM;
            break;
        case 4:
            translatedSate = "ALARM"
            break;
    };

    log.debug("translateToState() Translated state is " + translatedSate);
    return translatedSate
}


/**
 * Initializer method, fired after the config has been applied
 */
SectorSecuritySystemAccessory.prototype.init = function() {
	var self = this;
    self.log("Initilizing...")
	// set up polling if requested
    if (self.polling) {
        self.log("Starting polling with an interval of %s ms", self.pollInterval);
        var emitter = pollingtoevent(function (done) {
            self.getState(function (err, result) {
                done(err, result);
            });
        }, {
            longpolling: true,
            interval: self.pollInterval
        });

        emitter.on("longpoll", function (state) {
            self.log.debug("In poll function")
            
            if (state) {
                // Get OnceMore time Current State:
                        self.log("New state detected: (" + state + ") -> " + translateFromState(self.log, state) + ". Notify!");
                        self.securityService.setCharacteristic(Characteristic.SecuritySystemCurrentState, state);
                        currentState = state;
            }
        });

        emitter.on("err", function (err) {
            self.log("Polling failed, error was %s", err);
        });
    }
};

/**
 * Gets the state of the security system from a given URL
 *
 * @param {string} url The URL to poke for the result
 * @param {string} body The body of the request
 * @param {Function} callback The method to call with the results
 */
SectorSecuritySystemAccessory.prototype.getState = function(callback) {
    this.log.debug("Getting state")

    sectoralarm.connect(this.email, this.password, this.siteId)
    .then(site => {
        return site.status();
    })
    .then(status => {
        this.log.debug("Armed status: " + status.armedStatus)
        callback(null, translateToState(this.log, status.armedStatus));
    })
    .catch(error => {
        this.log(error.message);
        this.log(error.code);
        callback(error);
    })
};

SectorSecuritySystemAccessory.prototype.getCurrentState = function(callback) {
    this.log("Getting current state")

    var self = this;

    if (self.polling) {
        callback(null, currentState);
    } else {
        self.log('Getting current state - delayed...');
        waitUntil()
            .interval(500)
            .times(15)
            .condition(function () {
                return (currentState ? true : false);
            })
            .done(function (result) {
                // do stuff
                self.log('Update current state to:', currentState);
                callback(null, currentState);

            });
    }
};

/**
 * Gets the state of the security system from a given URL
 *
 * @param {string} url The URL to poke for the result
 * @param {string} body The body of the request
 * @param {Function} callback The method to call with the results
 */
SectorSecuritySystemAccessory.prototype.setTargetState = function(state, callback) {
    self = this; 
    self.log.debug("Setting target state.")
    code = this.code;
    sectoralarm.connect(self.email, self.password, self.siteId)
    .then((site) => {
        switch (state) {
            case Characteristic.SecuritySystemTargetState.STAY_ARM:
                site.partialArm(code)
                break;
            case Characteristic.SecuritySystemTargetState.NIGHT_ARM:
                site.partialArm(code)
                break;
            case Characteristic.SecuritySystemTargetState.AWAY_ARM:
                site.arm(code)
                break;
            case Characteristic.SecuritySystemTargetState.DISARM:
                site.arm(code)
                break;
        };
    })
    .then(status => {
        this.log.debug("Armed status: " + status.armedStatus)
        callback(null, translateToState(self.log, status.armedStatus));
        self.securityService.setCharacteristic(Characteristic.SecuritySystemCurrentState, state);
        currentState = state;
        callback(null, state);
    })
    .catch(error => {
        this.log(error.message);
        this.log(error.code);
        callback(error);
    })
};

SectorSecuritySystemAccessory.prototype.getTargetState = function(callback) {
    self = this;

    self.log.debug("Setting target state.")
    if (self.polling) {
        callback(null, currentState);
    } else {
        self.log("Getting target state...");
        self.getState(callback);
    }

};

/**
 * Identifies the security device (?)
 *
 * @param {Function} callback The method to call with the results
 */
SectorSecuritySystemAccessory.prototype.identify = function(callback) {
	this.log("Identify requested!");
	callback();
};

/**
 * Returns the services offered by this security device
 *
 * @returns {Array} The services offered
 */
SectorSecuritySystemAccessory.prototype.getServices =  function() {
	this.securityService = new Service.SecuritySystem(this.name);

	this.securityService
		.getCharacteristic(Characteristic.SecuritySystemCurrentState)
		.on("get", this.getCurrentState.bind(this));

	this.securityService
		.getCharacteristic(Characteristic.SecuritySystemTargetState)
		.on("get", this.getTargetState.bind(this))
		.on("set", this.setTargetState.bind(this));

        this.infoService = new Service.AccessoryInformation();
        this.infoService
            .setCharacteristic(Characteristic.Manufacturer, "Fredrik JL")
            .setCharacteristic(Characteristic.Model, this.name)
            .setCharacteristic(Characteristic.SerialNumber, "1234");

	return [ this.securityService ];
};
