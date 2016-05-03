var MaxCube = require('maxcube');

module.exports = function(RED) {
  function MaxcubeNode(config) {
    var node = this;
    RED.nodes.createNode(this, config);
    var node = this;
    this.ip = config.ip;
    this.port = config.port;

    if (!node.ip || !node.port) {
      return;
    }

    node.maxCube = new MaxCube(node.ip, node.port);

    node.maxCube.on('closed', function () {
      node.status({fill:"red",shape:"ring",text:"disconnected"});
    });

    node.maxCube.on('connected', function () {
      node.status({fill:"green",shape:"dot",text:"connected"});
    });

    node.on('input', function(msg) {
      node.maxCube.setTemperature(msg.payload.rf_address, msg.payload.degrees).then(function (success) {
        if (success) {
          node.log('Temperature set');
        } else {
          node.log('Error setting temperature');
        }
      });
    });

    node.on("close", function() {
      node.maxCube.close();
    });
  }
  RED.nodes.registerType("maxcube", MaxcubeNode);
}
