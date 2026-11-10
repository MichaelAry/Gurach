import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';

const uri = process.env.MONGODB_URI;
if (!uri) throw new Error('MONGODB_URI is required');

const connection = mongoose.createConnection(uri, {
  serverSelectionTimeoutMS: 8_000,
});
let probeCollection;
try {
  await connection.asPromise();
  const hello = await connection.db.admin().command({ hello: 1 });
  if (hello.setName !== 'rs0' || hello.isWritablePrimary !== true) {
    throw new Error('MongoDB is not the writable primary in replica set rs0');
  }

  probeCollection = `__gurach_transaction_probe_${randomUUID().replaceAll('-', '')}`;
  await connection.createCollection(probeCollection);
  const session = await connection.startSession();
  try {
    await session.withTransaction(async () => {
      await connection.collection(probeCollection).insertOne(
        { _id: 'committed', createdAt: new Date() },
        { session },
      );
      const probe = await connection
        .collection(probeCollection)
        .findOne({ _id: 'committed' }, { session });
      if (!probe) throw new Error('Transaction probe was not visible in its session');
    });
  } finally {
    await session.endSession();
  }

  const persisted = await connection.collection(probeCollection).findOne({ _id: 'committed' });
  if (!persisted) throw new Error('Transaction probe did not commit');
  console.log('Mongo app user connected; rs0 primary and transaction commit verified');
} finally {
  if (probeCollection && connection.readyState === 1) {
    await connection.dropCollection(probeCollection).catch(() => undefined);
  }
  await connection.close();
}
