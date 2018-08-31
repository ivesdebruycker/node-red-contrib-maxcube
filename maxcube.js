var MaxCube = require('maxcube');

module.exports = function(RED) {

  function statusEvents(node){
    if(node.maxCube){
      node.maxCube.on('closed', function () {
        node.status({fill:"red",shape:"ring",text:"disconnected"});
      });

      node.maxCube.on('connected', function () {
        node.status({fill:"green",shape:"dot",text:"connected"});
      });
    }
  }

  function MaxcubeNodeIn(config) {
    var node = this;
    RED.nodes.createNode(this, config);

    this.serverConfig = RED.nodes.getNode(config.server);

    if (!this.serverConfig) {
      return;
    }

    node.maxCube = this.serverConfig.maxCube;
    statusEvents(node);

    node.on('input', function(msg) {
      //temporary disabled by settings
      if(this.serverConfig.disabled ){
          node.status({fill:"yellow",shape:"dot",text:"disabled"});
          node.warn("maxcube "+this.serverConfig.host+" disabled");
          //close existing
          if(node.maxCube){
            node.warn("closing exising connection: "+this.serverConfig.host);
            node.maxCube.close();
          }
          return;
      }

      node.maxCube.setTemperature(msg.payload.rf_address, msg.payload.degrees, msg.payload.mode, msg.payload.untilDate).then(function (success) {
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
    RED.nodes.createNode(this, config);

    this.serverConfig = RED.nodes.getNode(config.server);

    if (!this.serverConfig) {
      return;
    }

    node.maxCube = this.serverConfig.maxCube;
    statusEvents(node);

    node.on('input', function(msg) {
      //temporary disabled by settings
      if(this.serverConfig.disabled ){
          node.status({fill:"yellow",shape:"dot",text:"disabled"});
          node.warn("maxcube "+this.serverConfig.host+" disabled");
          //close existing
          if(node.maxCube){
            node.warn("closing exising connection: "+this.serverConfig.host);
            node.maxCube.close();
          }
          return;
      }

      node.log(JSON.stringify(node.maxCube.getCommStatus()));
      node.maxCube.getDeviceStatus().then(function (payload) {
        // send devices statuses as separate messages
        node.send([payload.map(function function_name(deviceStatus) {
            // add device name, room name, to status object
            var deviceInfo = node.maxCube.getDeviceInfo(deviceStatus.rf_address);
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
