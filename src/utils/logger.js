// Log levels
const LogLevel = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3
};

class Logger {
  constructor() {
    this.level = LogLevel.WARN; // Default to WARN level
  }

  setLevel(level) {
    this.level = level;
  }

  debug(message, ...args) {
    if (this.level <= LogLevel.DEBUG) {
      console.debug(`[Weibo Reader] ${message}`, ...args);
    }
  }

  info(message, ...args) {
    if (this.level <= LogLevel.INFO) {
      console.info(`[Weibo Reader] ${message}`, ...args);
    }
  }

  warn(message, ...args) {
    if (this.level <= LogLevel.WARN) {
      console.warn(`[Weibo Reader] ${message}`, ...args);
    }
  }

  error(message, ...args) {
    if (this.level <= LogLevel.ERROR) {
      console.error(`[Weibo Reader] ${message}`, ...args);
    }
  }
}

const logger = new Logger();

// Support both ES modules and content script environments
if (typeof exports !== 'undefined') {
  exports.logger = logger;
  exports.LogLevel = LogLevel;
} else if (typeof window !== 'undefined') {
  window.weiboLogger = logger;
  window.LogLevel = LogLevel;
} else {
  globalThis.weiboLogger = logger;
  globalThis.LogLevel = LogLevel;
}

export { logger, LogLevel };
