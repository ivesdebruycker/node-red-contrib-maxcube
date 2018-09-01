var MaxCube = require('maxcube2');

module.exports = function(RED) {

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
    var maxCube = node.serverConfig.maxCube;
    if(maxCube){
      maxCube.on('closed', function () {
        node.status({fill:"red",shape:"ring",text:"disconnected"});
      });

      maxCube.on('connected', function () {
        node.status({fill:"green",shape:"dot",text:"connected"});
      });
    }

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

  function MaxcubeNodeIn(config) {
    var node = this;
    if(!initNode(node, config)){
      return;
    }

    node.on('input', function(msg) {
      if(checkInputDisabled(node)){
        return;
      };

      var maxCube = node.serverConfig.maxCube;

      var setTemp = function(rf_address, degrees, mode, untilDate){
        maxCube.setTemperature(rf_address, degrees, mode, untilDate).then(function (success) {
          if (success) {
            node.log('Temperature set (' + [rf_address, degrees, mode, untilDate].filter(function (val) {return val;}).join(', ') + ')');
          } else {
            node.log('Error setting temperature');
          }
        }).catch(function(e) {
          node.warn(e);
        });
      }

      var devices = [];
      //specific device
      if(msg.payload.rf_address){
        setTemp(msg.payload.rf_address, msg.payload.degrees, msg.payload.mode, msg.payload.untilDate);
      }else{
        //all devices: query getDeviceStatus, then update all!
        maxCube.getDeviceStatus().then(function (devices) {
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
              node.warn("Ignoring device "+deviceStatus.rf_address + "(device_type "+deviceInfo.device_type+")");
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
      };

      var additionalData = function(deviceStatus, maxCube){
        var deviceInfo = maxCube.getDeviceInfo(deviceStatus.rf_address);
        if(deviceInfo){
          deviceStatus.device_type = deviceInfo.device_type;
          deviceStatus.device_name = deviceInfo.device_name;
          deviceStatus.room_name = deviceInfo.room_name;
          deviceStatus.room_id = deviceInfo.room_id;
        }
      }

      var maxCube = node.serverConfig.maxCube;
      node.log(JSON.stringify(maxCube.getCommStatus()));
      maxCube.getDeviceStatus().then(function (devices) {

        if(node.singleMessage){
          // send devices statuses as single message
          var msg = {};
          for (var i = 0; i < devices.length; i++) {
            var deviceStatus = devices[i];
            additionalData(deviceStatus, maxCube);
            msg[deviceStatus.rf_address] = deviceStatus;
          }
          node.send({payload: msg});
        }else{
          // send devices statuses as separate messages
          node.send([devices.map(function function_name(deviceStatus) {
             // add device name, room name, to status object
             additionalData(deviceStatus, maxCube);
             return { rf_address: deviceStatus.rf_address, payload: deviceStatus };
           })]);
         }
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
      };

      var maxCube = node.serverConfig.maxCube;
      node.log(JSON.stringify(maxCube.getCommStatus()));
      maxCube.getDeviceStatus().then(function (devices) {

        if(node.singleMessage){
          // send devices statuses as single message
          var msg = {};
          for (var i = 0; i < devices.length; i++) {
            var deviceStatus = devices[i];
            var conf = maxCube.getDeviceConfiguration(deviceStatus.rf_address);
            msg[deviceStatus.rf_address] = conf;
          }
          node.send({payload: msg});
        }else{
          // send devices statuses as separate messages
          node.send([devices.map(function function_name(deviceStatus) {
             var conf = maxCube.getDeviceConfiguration(deviceStatus.rf_address);
             return { rf_address: deviceStatus.rf_address, payload: conf };
           })]);
         }
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

    if (this.disabled || !node.host || !node.port) {
      return;
    }

    node.maxCube = new MaxCube(node.host, node.port);

    node.on("close", function() {
      node.maxCube.close();
    });
  }
  RED.nodes.registerType("maxcube-server", MaxcubeServerNode);
}
