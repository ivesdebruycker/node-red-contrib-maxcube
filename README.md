# node-red-contrib-maxcube
A collection of node-red nodes to control the eQ-3 Max! Cube

## Installation
```
cd $HOME/.node-red
npm install node-red-contrib-maxcube
```
Restart Node-RED.

## Nodes
### maxcube config node
Set ip and port of your Max! Cube

### maxcube (input)
A node to query the eQ-3 Max! Cube for device states.

Whenever an input message is received, device states are updated from the Max! Cube, and sent as separate messages (one for each device) with following structure:
```
{
  "rf_address": "0abc12",
  "initialized": true,
  "fromCmd": false,
  "error": false,
  "valid": true,
  "mode": "MANUAL",
  "dst_active": true,
  "gateway_known": true,
  "panel_locked": false,
  "link_error": false,
  "battery_low": false,
  "valve": 0,
  "setpoint": 5,
  "temp": 15.4
}
```

### maxcube (output)of a device
A node to set the temperature and/or the mode of a device.
Valid modes are "AUTO", "MANUAL" and "BOOST".

Accepts messages with payload of type object with following structure:
```
{
  "rf_address": "0abc12",
  "degrees": 20,
  "mode":"MANUAL"
}
```
