var MaxCube = require('maxcube2');

module.exports = function(RED) {


  function sendCommStatus(node, success, data, error){
      var maxCube = node.serverConfig.maxCube;
      var duty_cycle = maxCube.getCommStatus();
      node.log(JSON.stringify(duty_cycle));
      var msg = {};
      msg.success = success;
      msg.data = data;
      msg.error = error;
      msg.comm_status = duty_cycle;
      node.send({payload: msg});
  }

  //missing configurations
  function initNode(node, config){
    //create node
    RED.nodes.createNode(node, config);
    //check and propagate configurations
    node.serverConfig = RED.nodes.getNode(config.server);
    node.singleMessage = config.singleMessage;
    if (!node.serverConfig) {
      return false;
    }

    //handle status icons
    node.serverConfig.on('closed', function () {
      node.status({fill:"red",shape:"ring",text:"disconnected"});
    });

    node.serverConfig.on('connected', function () {
      node.status({fill:"green",shape:"dot",text:"connected"});
    });

    node.serverConfig.on('error', function (err) {
      node.log(err);
      node.status({fill:"red",shape:"dot",text:"Error: "+err});
    });

    return true;
  }

  function checkInputDisabled(node){
    var serverConfig = node.serverConfig;
    //temporary disabled by settings
    if(serverConfig.disabled){
        node.status({fill:"yellow",shape:"dot",text:"disabled"});
        node.warn("maxcube "+serverConfig.host+" disabled");
        //close existing
        if(serverConfig.maxCube){
          node.warn("closing exising connection: "+serverConfig.host);
          serverConfig.maxCube.close();
        }
        return true;
    }

    if(!serverConfig.maxCube){
      node.warn("maxCube item is not ready");
      node.status({fill:"red",shape:"ring",text:"error"});
    }
    return false;
  }

  function validateMsg(msg){
    //maxcube.js won't accept mode if lowercase
    if(msg.payload.mode){
      msg.payload.mode = msg.payload.mode.toUpperCase();
    }
  }

  function MaxcubeNodeIn(config) {
    var node = this;
    if(!initNode(node, config)){
      return;
    }

    node.on('input', function(msg) {
      if(checkInputDisabled(node)){
        return;
      }

      validateMsg(msg);

      var maxCube = node.serverConfig.maxCube;


      var setTemp = function(rf_address, degrees, mode, untilDate){
        // Give the cube 30 seconds to answer
        return maxCube.setTemperature(rf_address, degrees, mode, untilDate, 30000).then(function (success) {
          let data = [rf_address, degrees, mode, untilDate].filter(function (val) {return val;}).join(', ');
          node.status({fill:"green",shape:"dot",text: "last msg: "+JSON.stringify(data)});
          sendCommStatus(node, success, data);
          if (success) {
            node.log('Temperature set (' + data+ ')');
            return true;
          } else {
            node.warn('Temperature set command (' + data+ ') discarded by cube. Maybe duty cycle exceeded.');
            throw new Error( 'Temperature set command discarded.' );
          }
        }).catch(function(e) {
          node.warn(e);
          sendCommStatus(node, false, undefined, e);
          // rethrow error to pass it on up the stack
          throw e;
        });
      };

      var resetDevice = function( rf_address ){
        // Timeout after 30 seconds
        node.log( 'Calling resetError for ' + rf_address );
        return maxCube.resetError( rf_address, 30000 ).then( function (success) {
          node.status( { fill: 'green', shape: 'dot', text: 'last msg: reset ' + JSON.stringify(rf_address) } );
          sendCommStatus(node, success, rf_address);
          if( success ) {
            node.log( 'Device reset: ' + rf_address );
            return true;
          } else {
            node.log( 'Reset command for device ' + rf_address + ' discarded by cube. Maybe duty cycle exceeded.' );
            throw new Error( 'Reset command discarded.' );
          }
        } ).catch( function( e ) {
          node.warn(e);
          sendCommStatus(node, false, rf_address, e);
          // rethrow error to pass it on up the stack
          throw e;
        } );
      };

      let sendCommand = function( rf_address, payload ){
        let setTempFunc;
        if( payload.degrees || payload.mode || payload.untilDate ) {
          // Temperature data is available, so register the function
          setTempFunc = function() {
            return setTemp( rf_address, payload.degrees, payload.mode, payload.untilDate ).catch( function( err ) {
              // Do nothing, everything has been done already
              // But still catch the error, because uncaught errors are bad
            } );
          };
        } else {
          // No temperature data, so do nothing successfully
          setTempFunc = function() {
            return true;
          };
        }
        
        if( payload.reset ){
          node.log( 'Calling resetDevice for ' + rf_address );
          return resetDevice( rf_address ).then( function( success ) {
            node.log( 'Calling setTempFunc for ' + rf_address );
            return setTempFunc();
          } ).catch( function( err ) {
            // do nothing, everything has been done already
            // but still catch the error, because uncaught errors are bad
          } );
        } else {
          node.log( 'Calling setTempFunc for ' + rf_address );
          return setTempFunc();
        }
      };

      //specific device
      if(msg.payload.rf_address){
        sendCommand( msg.payload.rf_address, msg.payload );
      } else {
        //all devices: query getDeviceStatus, then update all!
        // Give the cube 30 seconds to answer
        maxCube.getDeviceStatus( undefined, 30000 ).then(function (devices) {
          for (var i = 0; i < devices.length; i++) {
            var deviceStatus = devices[i];
            var deviceInfo = maxCube.getDeviceInfo(deviceStatus.rf_address);
            // cube	0                 --> No reset, no temperature
            // radiator thermostat	1 --> Reset and temperature
            // radiator thermostat plus	2 --> Reset and temperature
            // wall thermostat	3         --> Reset and temperature
            // shutter contact	4         --> No reset, no temperature
            // eco button	5         --> Reset, but no temperature. Are we sure about that?
            // unknown	6                 --> Unknown, so do nothing
            let payload = msg.payload;
            switch( deviceInfo.device_type ) {
            case '0':
            case '4':
            case '6':
              // Do nothing, no matter what the user requested.
              payload.reset = false;
              payload.degrees = undefined;
              payload.mode = undefined;
              payload.untilDate = undefined;
              break;
            case '5':
              // Do a reset, but don't send a temperature, even if the user requests.
              payload.degrees = undefined;
              payload.mode = undefined;
              payload.untilDate = undefined;
              break;
            case '1':
            case '2':
            case '3':
              // Do whatever the user requested.
              break;
            default:
              node.error( 'Unknown device type: ' + deviceInfo.device_type + ' at address ' + deviceStatus.rf_address );
              return;
            }
            node.log( 'Sending command to device ' + deviceStatus.rf_address );
            sendCommand( deviceStatus.rf_address, payload );
          }
        } ).catch( function( err ) {
          node.error( 'Uncaught error in getDeviceStatus.' );
        } );
      }
    });
  }
  RED.nodes.registerType("maxcube in", MaxcubeNodeIn);

  function MaxcubeNodeOut(config) {
    var node = this;
    if(!initNode(node, config)){
      return;
    }

    node.on('input', function(msg) {
      if(checkInputDisabled(node)){
        return;
      }

      var additionalData = function(deviceStatus, maxCube){
        var deviceInfo = maxCube.getDeviceInfo(deviceStatus.rf_address);
        if(deviceInfo){
          var whitelist = ['device_type', 'device_name', 'room_name', 'room_id'];
          for (var i = 0; i < whitelist.length; i++) {
            var key = whitelist[i];
            if(deviceInfo[key]){
                deviceStatus[key] = deviceInfo[key];
            }
          }
        }
      };

      var maxCube = node.serverConfig.maxCube;
      var duty_cycle = maxCube.getCommStatus();
      node.log(JSON.stringify(duty_cycle));
      // Give the cube 30 seconds to answer
      maxCube.getDeviceStatus( undefined, 30000).then(function (devices) {

        if(node.singleMessage){
          // send devices statuses as single message
          var msg = {};
          for (var i = 0; i < devices.length; i++) {
            var deviceStatus = devices[i];
            additionalData(deviceStatus, maxCube);
            msg[deviceStatus.rf_address] = deviceStatus;
          }
          msg.comm_status = duty_cycle;
          node.send({payload: msg});
        }else{
          // send devices statuses as separate messages
          node.send([devices.map(function function_name(deviceStatus) {
             // add device name, room name, to status object
             additionalData(deviceStatus, maxCube);
             deviceStatus.comm_status = duty_cycle;
             return { rf_address: deviceStatus.rf_address, payload: deviceStatus };
           })]);
         }
         node.status({fill:"green",shape:"dot",text: "last call: "+new Date().toTimeString()});
      });
    });
  }
  RED.nodes.registerType("maxcube out", MaxcubeNodeOut);


  function MaxcubeDeviceConfigNodeOut(config) {
    var node = this;
    if(!initNode(node, config)){
      return;
    }

    node.on('input', function(msg) {
      if(checkInputDisabled(node)){
        return;
      }

      var maxCube = node.serverConfig.maxCube;
      var duty_cycle = maxCube.getCommStatus();
      node.log(JSON.stringify(duty_cycle));
      // Give the cube 30 seconds to answer
      maxCube.getDeviceStatus( undefined, 30000 ).then(function (devices) {

        if(node.singleMessage){
          // send devices statuses as single message
          var msg = {};
          for (var i = 0; i < devices.length; i++) {
            var deviceStatus = devices[i];
            var conf = maxCube.getDeviceConfiguration(deviceStatus.rf_address);
            msg[deviceStatus.rf_address] = conf;
          }
          msg.comm_status = duty_cycle;
          node.send({payload: msg});
        }else{
          // send devices statuses as separate messages
          node.send([devices.map(function function_name(deviceStatus) {
             var conf = maxCube.getDeviceConfiguration(deviceStatus.rf_address);
             conf.comm_status = duty_cycle;
             return { rf_address: deviceStatus.rf_address, payload: conf };
           })]);
         }
         node.status({fill:"green",shape:"dot",text: "last call: "+new Date().toTimeString()});
      });
    });
  }
  RED.nodes.registerType("maxcube device config", MaxcubeDeviceConfigNodeOut);


  function MaxcubeServerNode(config) {
    var node = this;
    RED.nodes.createNode(this, config);
    node.log(config.singleMessage);

    this.host = config.host;
    this.port = config.port;
    this.disabled = config.disabled;

    node.maxcubeConnect = function(){

      if(node.maxCube){
         node.maxCube.removeAllListeners('closed');
         node.maxCube.close();
         node.maxCube = undefined;
      }

      if (node.disabled || !node.host || !node.port) {
        node.log("Maxcube disabled");
        return;
      }

      //connect/new instance
      node.log("Preparing new maxcube connection");
      node.maxCube = new MaxCube(node.host, node.port);

      //common events
      if(node.maxCube){
        node.log("Preparing new Maxcube events callback");
        node.maxCube.on('closed', function () {
          node.emit('closed');
          if(node.maxCube != null) {
            node.log("Maxcube connection closed unexpectedly... will try to reconnect in one second.");
            setTimeout( node.maxcubeConnect, 1000 );
          }
          else
            node.log("Maxcube connection closed...");
        });
        node.maxCube.on('error', function (e) {
          node.emit('error', e);
          node.log("Error connecting to the cube.");
          node.log(JSON.stringify(e));
          //force node to init connection if not available
          node.log("Maxcube was disconnected... will try to reconnect in one second.");
          setTimeout( node.maxcubeConnect, 1000 );
        });
        node.maxCube.on('connected', function () {
          node.emit('connected');
          node.log("Maxcube connected");
        });
      }
    };

    node.on("close", function() {
      if(node.maxCube){
        var maxCube = node.maxCube;
        node.maxCube = null;
        maxCube.close();
      }
    });

    //first connection
    node.maxcubeConnect();

  }

  RED.nodes.registerType("maxcube-server", MaxcubeServerNode);
}
