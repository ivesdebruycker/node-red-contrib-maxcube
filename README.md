# node-red-contrib-maxcube
A node-red node to control the eQ-3 Max! Cube

## Installation
```
cd $HOME/.node-red
npm install node-red-contrib-maxcube
```
Restart Node-RED.

## Nodes
### maxcube
Accepts messages with payload of type object with following structure:
```
{
  "rf_address": "0abc12",
  "degrees": 20
}
```
