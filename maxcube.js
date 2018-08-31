var MaxCube = require('maxcube');

module.exports = function(RED) {

  //missing configurations
  function initNode(node, config){
    //create node
    RED.nodes.createNode(node, config);
    //check configurations
    node.serverConfig = RED.nodes.getNode(config.server);
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
      maxCube.setTemperature(msg.payload.rf_address, msg.payload.degrees, msg.payload.mode, msg.payload.untilDate).then(function (success) {
        if (success) {
          node.log('Temperature set (' + [msg.payload.rf_address, msg.payload.degrees, msg.payload.mode, msg.payload.untilDate].filter(function (val) {return val;}).join(', ') + ')');
        } else {
          node.log('Error setting temperature');
        }
      }).catch(function(e) {
        node.warn(e);
      });
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

      var maxCube = node.serverConfig.maxCube;
      node.log(JSON.stringify(maxCube.getCommStatus()));
      maxCube.getDeviceStatus().then(function (payload) {
        // send devices statuses as separate messages
        node.send([payload.map(function function_name(deviceStatus) {
            // add device name, room name, to status object
            var deviceInfo = maxCube.getDeviceInfo(deviceStatus.rf_address);
            if(deviceInfo!==undefined){
              deviceStatus.device_name = deviceInfo.device_name;
              deviceStatus.room_name = deviceInfo.room_name;
            }
           return { rf_address: deviceStatus.rf_address, payload: deviceStatus };
         })]);
      });
    });
  }
  RED.nodes.registerType("maxcube out", MaxcubeNodeOut);

  function MaxcubeServerNode(config) {
    var node = this;
    RED.nodes.createNode(this, config);

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
