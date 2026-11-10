const appDatabaseName = process.env.MONGO_APP_DATABASE;
const applicationDatabase = db.getSiblingDB(appDatabaseName);

applicationDatabase.createUser({
  user: process.env.MONGO_APP_USERNAME,
  pwd: process.env.MONGO_APP_PASSWORD,
  roles: [{ role: 'readWrite', db: appDatabaseName }],
});
