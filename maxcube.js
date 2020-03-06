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
        // Give the cube 30 seconds to anwer
        maxCube.setTemperature(rf_address, degrees, mode, untilDate, 30000).then(function (success) {
          var data = [rf_address, degrees, mode, untilDate].filter(function (val) {return val;}).join(', ');
          if (success) {
            node.log('Temperature set (' + data+ ')');
          } else {
            node.log('Error setting temperature (' + data+ ')');
          }
          node.status({fill:"green",shape:"dot",text: "last msg: "+JSON.stringify(data)});
          sendCommStatus(node, success, data);
        }).catch(function(e) {
          node.warn(e);
          sendCommStatus(node, false, data, e);
        });
      };

      var devices = [];
      //specific device
      if(msg.payload.rf_address){
        setTemp(msg.payload.rf_address, msg.payload.degrees, msg.payload.mode, msg.payload.untilDate);
      }else{
        //all devices: query getDeviceStatus, then update all!
        // Give the cube 30 seconds to answer
        maxCube.getDeviceStatus( undefined, 30000 ).then(function (devices) {
          for (var i = 0; i < devices.length; i++) {
            var deviceStatus = devices[i];
            //ignoring eco buttons/window switch/etc
            // cube	0
            // radiator thermostat	1
            // radiator thermostat plus	2
            // wall thermostat	3
            // shutter contact	4
            // eco button	5
            // unknown	6
            var deviceInfo = maxCube.getDeviceInfo(deviceStatus.rf_address);
            if(deviceInfo.device_type == '1' || deviceInfo.device_type == '2' || deviceInfo.device_type == '3'){
              setTemp(deviceStatus.rf_address, msg.payload.degrees, msg.payload.mode, msg.payload.untilDate);
            }else{
              node.log("Ignoring device "+deviceStatus.rf_address + "(device_type "+deviceInfo.device_type+")");
            }
          }
        });
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
          connected = false;
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
          connected = false;
          //force node to init connection if not available
          node.log("Maxcube was disconnected... will try to reconnect in one second.");
          setTimeout( node.maxcubeConnect, 1000 );
        });
        node.maxCube.on('connected', function () {
          node.emit('connected');
          node.log("Maxcube connected");
          connected = true;
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
    var connected = false;
    node.maxcubeConnect();

  }

  RED.nodes.registerType("maxcube-server", MaxcubeServerNode);
}
