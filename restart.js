const config = require('./config.js');
require('dotenv').config()
const { sleep, chooseRpc, unpause, pause, getPredictionContract } = require("./lib.js");

const runOnStart = async () => {
    let i = 0;

    await chooseRpc(config.predictions[i].network);

    if(!config.predictions[i].keepPaused){
        const predictionContract = getPredictionContract(i);
        const isPaused = await predictionContract.methods.paused().call();
        if(!isPaused) {
            await pause(i);
            await sleep(2000);
        }
        await unpause(i);
        
    }

};

runOnStart();