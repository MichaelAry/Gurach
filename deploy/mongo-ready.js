const admin = db.getSiblingDB('admin');
const auth = admin.auth(process.env.MONGO_INITDB_ROOT_USERNAME, process.env.MONGO_INITDB_ROOT_PASSWORD);
if (auth !== 1 && auth?.ok !== 1) quit(1);
try {
  const status = rs.status();
  quit(status.set === 'rs0' && status.myState === 1 ? 0 : 1);
} catch (error) {
  if (error.code !== 94) quit(1);
  rs.initiate({ _id: 'rs0', members: [{ _id: 0, host: 'mongodb:27017' }] });
  quit(1);
}
