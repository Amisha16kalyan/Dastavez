const fs = require("fs");
const path = require("path");
const util = require("util");

const LOGS_DIR = process.env.LOGS_DIR || path.join(__dirname, "../logs");
fs.mkdirSync(LOGS_DIR, { recursive: true });

function today() {
  return new Date().toISOString().slice(0, 10);
}

// Sync append so crash logs are flushed before process.exit
function write(level, args) {
  const date = today();
  const line = `[${new Date().toISOString()}] [${level}] ${util.format(...args)}\n`;
  try {
    fs.appendFileSync(path.join(LOGS_DIR, `server-${date}.log`), line);
    if (level === "ERROR" || level === "WARN") {
      fs.appendFileSync(path.join(LOGS_DIR, `error-${date}.log`), line);
    }
  } catch {
    // Never let logging failures crash the server
  }
}

const original = {
  log: console.log.bind(console),
  info: console.info.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
};

console.log = (...args) => { original.log(...args); write("INFO", args); };
console.info = (...args) => { original.info(...args); write("INFO", args); };
console.warn = (...args) => { original.warn(...args); write("WARN", args); };
console.error = (...args) => { original.error(...args); write("ERROR", args); };

function requestLogger(req, res, next) {
  const start = process.hrtime.bigint();
  res.on("finish", () => {
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    const msg = `${req.method} ${req.originalUrl} ${res.statusCode} ${ms.toFixed(1)}ms - ${req.ip}`;
    if (res.statusCode >= 500) console.error(msg);
    else if (res.statusCode >= 400) console.warn(msg);
    else console.log(msg);
  });
  next();
}

module.exports = { requestLogger, LOGS_DIR };
