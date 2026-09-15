function healthResponse(databaseReady) {
  return {
    statusCode: databaseReady ? 200 : 503,
    body: {
      service: 'todo-public',
      protocol: 1,
      status: databaseReady ? 'ok' : 'unavailable',
      database: databaseReady ? 'ready' : 'not-ready',
    },
  };
}

module.exports = { healthResponse };
