const port = Number(process.env.APP_PORT);
const redisUrl = process.env.REDIS_URL;
const sendgridKey = process.env.SENDGRID_API_KEY;
module.exports = { port, redisUrl, sendgridKey };
