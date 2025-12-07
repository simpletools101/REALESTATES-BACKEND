import { config } from "dotenv";
import path from "path";

// Load environment variables
config({ path: path.resolve(process.cwd(), '.env') });

import {
  DynamoDBClient,
  CreateTableCommand,
  DescribeTableCommand,
} from "@aws-sdk/client-dynamodb";

// DynamoDB configuration
const dynamoDBConfig = {
  region: process.env.AWS_REGION || "eu-north-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
  },
};

const client = new DynamoDBClient(dynamoDBConfig);
const tableName = "realevr-settings";

async function createSettingsTable() {
  try {
    console.log(`Checking if table ${tableName} exists...`);
    
    // Check if table already exists
    try {
      await client.send(new DescribeTableCommand({ TableName: tableName }));
      console.log(`✅ Table ${tableName} already exists`);
      return;
    } catch (error: any) {
      if (error.name !== 'ResourceNotFoundException') {
        throw error;
      }
    }

    console.log(`Creating table ${tableName}...`);
    
    const createTableCommand = new CreateTableCommand({
      TableName: tableName,
      KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
      AttributeDefinitions: [{ AttributeName: "id", AttributeType: "S" }],
      BillingMode: "PAY_PER_REQUEST"
    });

    await client.send(createTableCommand);
    console.log(`✅ Table ${tableName} created successfully!`);
    
  } catch (error) {
    console.error(`❌ Error creating table ${tableName}:`, error);
    throw error;
  }
}

// Run the script
createSettingsTable()
  .then(() => {
    console.log("🎉 Settings table setup completed!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("💥 Setup failed:", error);
    process.exit(1);
  });
