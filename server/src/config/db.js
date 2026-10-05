import dns from 'node:dns';
import mongoose from 'mongoose';
import env from './env.js';
import logger from './logger.js';

mongoose.set('strictQuery', true);

export async function connectDB(uri = env.MONGODB_URI) {
  if (env.DNS_SERVERS) {
    dns.setServers(env.DNS_SERVERS.split(',').map((s) => s.trim()));
  }

  mongoose.connection.on('disconnected', () => logger.warn('MongoDB disconnected'));
  mongoose.connection.on('reconnected', () => logger.info('MongoDB reconnected'));

  await mongoose.connect(uri, {
    maxPoolSize: 20,
    minPoolSize: 2,
    serverSelectionTimeoutMS: 10_000,
    family: 4, // prefer IPv4 - avoids slow IPv6 fallbacks on some ISPs
  });
  logger.info({ host: mongoose.connection.host }, 'MongoDB connected');
  return mongoose.connection;
}

export async function disconnectDB() {
  await mongoose.disconnect();
}
