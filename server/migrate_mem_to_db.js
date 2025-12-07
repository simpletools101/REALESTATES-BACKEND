import { DatabaseStorage } from './storage.js';
import fs from 'fs';
import path from 'path';

async function migrateProperties() {
  const dbStorage = new DatabaseStorage();
  const dataPath = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../data.json');
  if (!fs.existsSync(dataPath)) {
    console.error('data.json not found!');
    process.exit(1);
  }
  const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  const properties = data.properties || [];
  let count = 0;
  for (const prop of properties) {
    const { id, ...insertProperty } = prop;
    try {
      await dbStorage.createProperty(insertProperty);
      count++;
    } catch (e) {
      console.error('Failed to insert property:', prop, e);
    }
  }
  console.log(`Migrated ${count} properties to the database.`);
}

await migrateProperties();
