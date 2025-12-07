import { config } from "dotenv";
import path from "path";

// Load environment variables
config({ path: path.resolve(process.cwd(), '.env') });

import { createTablesIfNotExist, listTables, checkDynamoDBHealth } from "./dynamodb";

// Setup script for DynamoDB
async function setupDynamoDB(): Promise<void> {
  console.log("🚀 Setting up DynamoDB for RealEVR Estates...");

  try {
    console.log("[DEBUG] Starting DynamoDB setup script...");
    // Create tables if they don't exist FIRST
    console.log("\n🔧 Creating tables (if needed)...");
    await createTablesIfNotExist();
    console.log("[DEBUG] Table creation step finished.");

    // List tables to confirm
    console.log("\n📋 Final table list:");
    const finalTables = await listTables();
    console.log("Tables:", finalTables.join(", "));
    console.log("[DEBUG] Table listing step finished.");

    // Now check DynamoDB connection/health
    console.log("\n🔍 Checking DynamoDB connection...");
    const isHealthy = await checkDynamoDBHealth();
    console.log(`[DEBUG] Health check result: ${isHealthy}`);
    if (!isHealthy) {
      console.error("❌ DynamoDB connection failed. Please check your AWS credentials and configuration.");
      console.log("\n📋 Required environment variables:");
      console.log("  - AWS_REGION (default: us-east-1)");
      console.log("  - AWS_ACCESS_KEY_ID");
      console.log("  - AWS_SECRET_ACCESS_KEY");
      console.log("\n📋 Optional table name overrides:");
      console.log("  - DYNAMODB_USERS_TABLE (default: realevr-users)");
      console.log("  - DYNAMODB_PROPERTIES_TABLE (default: realevr-properties)");
      console.log("  - DYNAMODB_AMENITIES_TABLE (default: realevr-amenities)");
      console.log("  - DYNAMODB_PROPERTY_TYPES_TABLE (default: realevr-property-types)");
      process.exit(1);
    }
    console.log("✅ DynamoDB connection successful!");
    console.log("\n🎉 DynamoDB setup completed successfully!");
    console.log("\n📝 Next steps:");
    console.log("1. Run migration script to transfer existing data:");
    console.log("   tsx server/migrate-to-dynamodb.ts from-json");
    console.log("   or");
    console.log("   tsx server/migrate-to-dynamodb.ts from-db");
    console.log("2. Start your application with DynamoDB storage");

  } catch (error) {
    console.error("💥 DynamoDB setup failed:", error);
    
    if (error instanceof Error) {
      if (error.message.includes('UnrecognizedClientException')) {
        console.log("\n💡 This error usually means your AWS credentials are invalid.");
        console.log("Please check your AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY.");
      } else if (error.message.includes('AccessDenied')) {
        console.log("\n💡 This error means your AWS credentials don't have sufficient permissions.");
        console.log("Required DynamoDB permissions:");
        console.log("  - dynamodb:CreateTable");
        console.log("  - dynamodb:DescribeTable");
        console.log("  - dynamodb:ListTables");
        console.log("  - dynamodb:PutItem");
        console.log("  - dynamodb:GetItem");
        console.log("  - dynamodb:UpdateItem");
        console.log("  - dynamodb:DeleteItem");
        console.log("  - dynamodb:Scan");
        console.log("  - dynamodb:Query");
      } else if (error.message.includes('NetworkingError')) {
        console.log("\n💡 This error suggests a network connectivity issue.");
        console.log("Please check your internet connection and AWS region setting.");
      }
    }
    
    process.exit(1);
  }
}

// Run setup if this file is executed directly
if (process.argv[1] && import.meta.url.endsWith(process.argv[1])) {
  setupDynamoDB();
}
