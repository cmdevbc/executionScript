var shell = require('shelljs');
const config = require('./config.js');
require('dotenv').config()
const { sleep, checkPredictionContract, pause, getPredictionContract } = require("./lib.js");

const runOnStart = async () => {
    for (let i = 0; i < config.predictions.length; i++) {
      if(config.predictions[i].keepPaused){
        const predictionContract = getPredictionContract(i);
        const isPaused = await predictionContract.methods.paused().call();
        if(!isPaused) pause(i);
      }
      else{
        checkPredictionContract(i);
      }
      await sleep(1000);
    }
};

const restartInterval = () => {
  shell.exec('pm2 restart execute');
} 

runOnStart();
if(config.restart){
  setInterval(restartInterval, config.restartTimer);
}