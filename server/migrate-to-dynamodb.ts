import { config } from "dotenv";
import path from "path";
import * as fs from 'fs';

// Load environment variables
config({ path: path.resolve(process.cwd(), '.env') });

import { DynamoDBStorage } from "./dynamodb-storage";
import { checkDynamoDBHealth } from "./dynamodb";

// Migration utility to transfer data from Neon/JSON to DynamoDB
export class DataMigration {
  private dynamoStorage: DynamoDBStorage;

  constructor() {
    this.dynamoStorage = new DynamoDBStorage();
  }

  

  // Migrate data from JSON file to DynamoDB
  async migrateFromJSON(jsonFilePath: string = 'data.json'): Promise<void> {
    console.log("🚀 Starting migration from JSON to DynamoDB...");

    try {
      // Check DynamoDB health first
      const isHealthy = await checkDynamoDBHealth();
      if (!isHealthy) {
        throw new Error("DynamoDB is not healthy. Please check your configuration.");
      }

      // Read JSON file
      if (!fs.existsSync(jsonFilePath)) {
        throw new Error(`JSON file not found: ${jsonFilePath}`);
      }

      const jsonData = JSON.parse(fs.readFileSync(jsonFilePath, 'utf8'));

      // Migrate users
      if (jsonData.users && Array.isArray(jsonData.users)) {
        console.log("👥 Migrating users from JSON...");
        console.log(`Found ${jsonData.users.length} users to migrate`);
        
        for (const user of jsonData.users) {
          try {
            // Check if user already exists in DynamoDB
            const existingUser = await this.dynamoStorage.getUserByUsername(user.username);
            if (!existingUser) {
              const { id, ...userWithoutId } = user;
              await this.dynamoStorage.createUser(userWithoutId);
              console.log(`✅ Migrated user: ${user.username}`);
            } else {
              console.log(`⏭️  User already exists: ${user.username}`);
            }
          } catch (error) {
            console.error(`❌ Failed to migrate user ${user.username}:`, error);
          }
        }
      }

      // Migrate amenities
      if (jsonData.amenities && Array.isArray(jsonData.amenities)) {
        console.log("🏷️  Migrating amenities from JSON...");
        console.log(`Found ${jsonData.amenities.length} amenities to migrate`);
        
        for (const amenity of jsonData.amenities) {
          try {
            const { id, ...amenityWithoutId } = amenity;
            await this.dynamoStorage.createAmenity(amenityWithoutId);
            console.log(`✅ Migrated amenity: ${amenity.name}`);
          } catch (error) {
            console.error(`❌ Failed to migrate amenity ${amenity.name}:`, error);
          }
        }
      }

      // Migrate property types
      if (jsonData.propertyTypes && Array.isArray(jsonData.propertyTypes)) {
        console.log("🏠 Migrating property types from JSON...");
        console.log(`Found ${jsonData.propertyTypes.length} property types to migrate`);
        
        for (const propertyType of jsonData.propertyTypes) {
          try {
            const { id, ...propertyTypeWithoutId } = propertyType;
            await this.dynamoStorage.createPropertyType(propertyTypeWithoutId);
            console.log(`✅ Migrated property type: ${propertyType.name}`);
          } catch (error) {
            console.error(`❌ Failed to migrate property type ${propertyType.name}:`, error);
          }
        }
      }

      // Migrate properties
      if (jsonData.properties && Array.isArray(jsonData.properties)) {
        console.log("🏘️  Migrating properties from JSON...");
        console.log(`Found ${jsonData.properties.length} properties to migrate`);
        
        for (const property of jsonData.properties) {
          try {
            const { id, ...propertyWithoutId } = property;
            await this.dynamoStorage.createProperty(propertyWithoutId);
            console.log(`✅ Migrated property: ${property.title}`);
          } catch (error) {
            console.error(`❌ Failed to migrate property ${property.title}:`, error);
          }
        }
      }

      console.log("🎉 JSON migration completed successfully!");

    } catch (error) {
      console.error("💥 JSON migration failed:", error);
      throw error;
    }
  }

  // Verify migration by comparing counts
  async verifyMigration(): Promise<void> {
    console.log("🔍 Verifying migration...");

    try {
      const dynamoUsers = await this.dynamoStorage.getAllUsers();
      const dynamoProperties = await this.dynamoStorage.getAllProperties();
      const dynamoAmenities = await this.dynamoStorage.getAllAmenities();
      const dynamoPropertyTypes = await this.dynamoStorage.getAllPropertyTypes();

      console.log("📊 Migration verification results:");
      console.log(`Users in DynamoDB: ${dynamoUsers.length}`);
      console.log(`Properties in DynamoDB: ${dynamoProperties.length}`);
      console.log(`Amenities in DynamoDB: ${dynamoAmenities.length}`);
      console.log(`Property Types in DynamoDB: ${dynamoPropertyTypes.length}`);

      // Try to compare with source if available
      

    } catch (error) {
      console.error("❌ Verification failed:", error);
      throw error;
    }
  }
}

// CLI interface for running migrations
if (import.meta.url === `file://${process.argv[1]}`) {
  const migration = new DataMigration();
  const command = process.argv[2];

  switch (command) {
    case 'from-json':
      const jsonFile = process.argv[3] || 'data.json';
      migration.migrateFromJSON(jsonFile)
        .then(() => migration.verifyMigration())
        .then(() => process.exit(0))
        .catch((error) => {
          console.error(error);
          process.exit(1);
        });
      break;
    
    case 'verify':
      migration.verifyMigration()
        .then(() => process.exit(0))
        .catch((error) => {
          console.error(error);
          process.exit(1);
        });
      break;
    
    default:
      console.log("Usage:");
      console.log("  tsx server/migrate-to-dynamodb.ts from-db     # Migrate from database");
      console.log("  tsx server/migrate-to-dynamodb.ts from-json [file]  # Migrate from JSON file");
      console.log("  tsx server/migrate-to-dynamodb.ts verify     # Verify migration");
      process.exit(1);
  }
}
