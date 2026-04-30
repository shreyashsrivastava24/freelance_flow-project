const DATABASE_ERROR_PATTERNS = [
  /buffering timed out/i,
  /server selection timed out/i,
  /MongoNetworkError/i,
  /MongoServerSelectionError/i,
  /MongooseServerSelectionError/i,
  /querySrv/i,
  /ECONNREFUSED/i,
  /ENOTFOUND/i,
  /ETIMEDOUT/i,
  /topology was destroyed/i,
];

const isDatabaseUnavailableError = (error) => {
  const message = error?.message || '';
  return DATABASE_ERROR_PATTERNS.some((pattern) => pattern.test(message));
};

const sendDatabaseUnavailable = (res, error, fallbackMessage) => {
  if (isDatabaseUnavailableError(error)) {
    return res.status(503).json({
      msg: 'Database unavailable. Verify your environment variables and MongoDB Atlas network access.',
    });
  }

  return res.status(500).json({
    msg: error?.message || fallbackMessage,
  });
};

module.exports = {
  isDatabaseUnavailableError,
  sendDatabaseUnavailable,
};
