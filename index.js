const express = require('express');
const cluster = require('cluster');
const os = require('os');
const Bull = require('bull');
const fs = require('fs-extra');
const Redis = require('ioredis');

const redisConnection = { host: '127.0.0.1', port: 6379 }; // Configure Redis connection

// Create a Redis client
const redisClient = new Redis(redisConnection);

// Create a Bull queue for task processing
const taskQueue = new Bull('taskQueue', { redis: redisConnection });


const numCPUs = os.cpus().length;

const rateLimitPerSec = 1;
const rateLimitPerMin = 20;
const port = 9000;




async function task(user_id) {
    const logMessage = `${user_id}-task completed at-${Date.now()}\n`;
    console.log(logMessage);
    await fs.appendFile('task_log.txt', logMessage);
}


async function checkRateLimit(user_id) {
    const currentTime = Date.now();
    const userKey = `rate-limit:${user_id}`;
    let userRateData = await redisClient.hgetall(userKey);

    if (!userRateData.lastSec || !userRateData.secCount || !userRateData.minCount) {
        userRateData = { lastSec: 0, secCount: 0, minCount: 0 };
    }

    const lastSec = parseInt(userRateData.lastSec);
    const secCount = parseInt(userRateData.secCount);
    const minCount = parseInt(userRateData.minCount);

    const timePassed = currentTime - lastSec;

    if (timePassed >= 60000) {
        await redisClient.hmset(userKey, { lastSec: currentTime, secCount: 1, minCount: 1 });
        return true;
    } else if (timePassed >= 1000) {
        if (secCount < rateLimitPerSec && minCount < rateLimitPerMin) {
            await redisClient.hmset(userKey, { lastSec: currentTime, secCount: secCount + 1, minCount: minCount + 1 });
            return true;
        }
    }

    return false;
}


taskQueue.process(async (job) => {
    const { user_id } = job.data;
    await task(user_id);
});


const app = express();
app.use(express.json());
app.use(express.urlencoded({extended:false}));

app.post('/api/v1/task', async (req, res) => {
    const { user_id } = req.body;
    
    if (!user_id) {
        return res.status(400).send({ message: 'User ID is required' });
    }

    const canProcess = await checkRateLimit(user_id);

    if (canProcess) {
        await taskQueue.add({ user_id });
        res.status(202).send({ message: 'Task queued' });
    } else {
        res.status(429).send({ message: 'Rate limit exceeded. Task queued for later processing.' });
    }
});

if (cluster.isMaster) {
    for (let i = 0; i < Math.min(numCPUs, 2); i++) {
        cluster.fork();
    }

    cluster.on('exit', (worker) => {
        console.log(`Worker ${worker.process.pid} died. Restarting...`);
        cluster.fork();
    });
} else {
    app.listen(port, () => {
        console.log(`Worker ${process.pid} started on port ${port}`);
    });
}
