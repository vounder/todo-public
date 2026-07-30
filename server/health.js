function healthResponse(databaseReady) {
  return {
    statusCode: databaseReady ? 200 : 503,
    body: {
      status: databaseReady ? 'ok' : 'unavailable',
      database: databaseReady ? 'ready' : 'not-ready',
    },
  };
}

module.exports = { healthResponse };
