const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://mongo:27017/todoapp';

async function connectDB() {
  let retries = 5;
  while (retries > 0) {
    try {
      await mongoose.connect(MONGODB_URI);
      console.log('MongoDB verbunden');
      return;
    } catch (error) {
      retries -= 1;
      console.error(
        `MongoDB Verbindungsfehler (${5 - retries}/5):`,
        error.message
      );
      if (retries === 0) throw error;
      console.log('Retry in 5 Sekunden...');
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
}

module.exports = { connectDB, mongoose };
