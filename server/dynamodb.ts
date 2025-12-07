import { config } from "dotenv";
import path from "path";

// Load environment variables
config({ path: path.resolve(process.cwd(), '.env') });

import {
  DynamoDBClient,
  CreateTableCommand,
  DescribeTableCommand,
  ListTablesCommand,
  type CreateTableCommandInput
} from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  UpdateCommand,
  DeleteCommand,
  ScanCommand,
  QueryCommand,
  BatchGetCommand,
  BatchWriteCommand
} from "@aws-sdk/lib-dynamodb";

// DynamoDB configuration
const dynamoDBConfig = {
  region: process.env.AWS_REGION || "eu-north-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
  },
};

// Create DynamoDB client
const client = new DynamoDBClient(dynamoDBConfig);
export const dynamoDb = DynamoDBDocumentClient.from(client);

// Table names
export const TABLES = {
  USERS: process.env.DYNAMODB_USERS_TABLE || "realevr-users",
  PROPERTIES: process.env.DYNAMODB_PROPERTIES_TABLE || "realevr-properties",
  AMENITIES: process.env.DYNAMODB_AMENITIES_TABLE || "realevr-amenities",
  PROPERTY_TYPES: process.env.DYNAMODB_PROPERTY_TYPES_TABLE || "realevr-property-types",
  USER_TOURS: process.env.DYNAMODB_USER_TOURS_TABLE || "realevr-user-tours",
  PROPERTY_VIEWS: process.env.DYNAMODB_PROPERTY_VIEWS_TABLE || "realevr-property-views",
  TOUR_PAYMENTS: process.env.DYNAMODB_TOUR_PAYMENTS_TABLE || "realevr-tour-payments",
  SETTINGS: process.env.DYNAMODB_SETTINGS_TABLE || "realevr-settings",
} as const;

// Maximum number of retry attempts
const MAX_RETRIES = 5;
// Initial delay in milliseconds before retrying
const INITIAL_RETRY_DELAY = 1000;
// Backoff multiplier for each retry attempt
const BACKOFF_FACTOR = 1.5;

// Helper function to execute DynamoDB operations with retry logic
export async function executeWithRetry<T>(operation: () => Promise<T>): Promise<T> {
  let retries = 0;
  let delay = INITIAL_RETRY_DELAY;
  
  while (retries < MAX_RETRIES) {
    try {
      return await operation();
    } catch (error: any) {
      // Check if error is retryable
      const isRetryableError = 
        error.name === 'ProvisionedThroughputExceededException' ||
        error.name === 'ThrottlingException' ||
        error.name === 'ServiceUnavailableException' ||
        error.name === 'InternalServerError' ||
        error.name === 'RequestLimitExceeded' ||
        error.code === 'NetworkingError' ||
        error.code === 'TimeoutError';
      
      if (!isRetryableError || retries >= MAX_RETRIES - 1) {
        // If it's not a retryable error or we've exhausted retries, rethrow
        throw error;
      }
      
      retries++;
      console.error(`DynamoDB operation failed (attempt ${retries}/${MAX_RETRIES}):`, error);
      
      console.log(`Retrying operation in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
      delay = Math.floor(delay * BACKOFF_FACTOR);
    }
  }
  
  throw new Error(`Failed to execute DynamoDB operation after ${MAX_RETRIES} attempts`);
}

// Helper function to generate unique IDs
export function generateId(): number {
  return Date.now();
}

// Helper function to convert number ID to string for DynamoDB
export function toStringId(id: number): string {
  return id.toString();
}

// Helper function to convert string ID back to number for compatibility
export function toNumericId(id: string): number {
  return parseInt(id, 10);
}

// Helper function to generate timestamp
export function generateTimestamp(): string {
  return new Date().toISOString();
}

// DynamoDB health check function
export async function checkDynamoDBHealth(): Promise<boolean> {
  try {
    // Test connection by scanning one of the tables with a limit
    await dynamoDb.send(new ScanCommand({
      TableName: TABLES.USERS,
      Limit: 1
    }));
    
    console.log('DynamoDB health check: Connection is healthy');
    return true;
  } catch (error) {
    console.error('DynamoDB health check failed:', error);
    return false;
  }
}

// Utility functions for common DynamoDB operations
export const DynamoDBUtils = {
  // Put item with retry
  async putItem(tableName: string, item: any) {
    return executeWithRetry(async () => {
      const command = new PutCommand({
        TableName: tableName,
        Item: item
      });
      return await dynamoDb.send(command);
    });
  },

  // Get item with retry
  async getItem(tableName: string, key: any) {
    return executeWithRetry(async () => {
      const command = new GetCommand({
        TableName: tableName,
        Key: key
      });
      const result = await dynamoDb.send(command);
      return result.Item;
    });
  },

  // Update item with retry
  async updateItem(tableName: string, key: any, updateExpression: string, expressionAttributeValues: any, expressionAttributeNames?: any) {
    return executeWithRetry(async () => {
      const command = new UpdateCommand({
        TableName: tableName,
        Key: key,
        UpdateExpression: updateExpression,
        ExpressionAttributeValues: expressionAttributeValues,
        ExpressionAttributeNames: expressionAttributeNames,
        ReturnValues: "ALL_NEW"
      });
      const result = await dynamoDb.send(command);
      return result.Attributes;
    });
  },

  // Delete item with retry
  async deleteItem(tableName: string, key: any) {
    return executeWithRetry(async () => {
      const command = new DeleteCommand({
        TableName: tableName,
        Key: key,
        ReturnValues: "ALL_OLD"
      });
      const result = await dynamoDb.send(command);
      return result.Attributes;
    });
  },

  // Scan table with retry
  async scanTable(tableName: string, filterExpression?: string, expressionAttributeValues?: any, expressionAttributeNames?: any) {
    return executeWithRetry(async () => {
      const command = new ScanCommand({
        TableName: tableName,
        FilterExpression: filterExpression,
        ExpressionAttributeValues: expressionAttributeValues,
        ExpressionAttributeNames: expressionAttributeNames
      });
      const result = await dynamoDb.send(command);
      return result.Items || [];
    });
  },

  // Query table with retry
  async queryTable(tableName: string, keyConditionExpression: string, expressionAttributeValues: any, expressionAttributeNames?: any, indexName?: string) {
    return executeWithRetry(async () => {
      const command = new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: keyConditionExpression,
        ExpressionAttributeValues: expressionAttributeValues,
        ExpressionAttributeNames: expressionAttributeNames,
        IndexName: indexName
      });
      const result = await dynamoDb.send(command);
      return result.Items || [];
    });
  },

  // Query method (alias for queryTable for backward compatibility)
  async query(tableName: string, keyConditionExpression: string, expressionAttributeValues: any, expressionAttributeNames?: any, indexName?: string) {
    return this.queryTable(tableName, keyConditionExpression, expressionAttributeValues, expressionAttributeNames, indexName);
  },
};

// Table creation utilities
export async function createTablesIfNotExist(): Promise<void> {
  console.log("🔧 Checking and creating DynamoDB tables...");

  const tableDefinitions: CreateTableCommandInput[] = [
    {
      TableName: TABLES.USERS,
      KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
      AttributeDefinitions: [{ AttributeName: "id", AttributeType: "S" }],
      BillingMode: "PAY_PER_REQUEST"
    },
    {
      TableName: TABLES.PROPERTIES,
      KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
      AttributeDefinitions: [{ AttributeName: "id", AttributeType: "S" }],
      BillingMode: "PAY_PER_REQUEST"
    },
    {
      TableName: TABLES.AMENITIES,
      KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
      AttributeDefinitions: [{ AttributeName: "id", AttributeType: "S" }],
      BillingMode: "PAY_PER_REQUEST"
    },
    {
      TableName: TABLES.PROPERTY_TYPES,
      KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
      AttributeDefinitions: [{ AttributeName: "id", AttributeType: "S" }],
      BillingMode: "PAY_PER_REQUEST"
    },
    {
      TableName: TABLES.USER_TOURS,
      KeySchema: [{ AttributeName: "userId", KeyType: "HASH" }, { AttributeName: "tourId", KeyType: "RANGE" }],
      AttributeDefinitions: [{ AttributeName: "userId", AttributeType: "S" }, { AttributeName: "tourId", AttributeType: "S" }],
      BillingMode: "PAY_PER_REQUEST"
    },
    {
      TableName: TABLES.PROPERTY_VIEWS,
      KeySchema: [{ AttributeName: "propertyId", KeyType: "HASH" }, { AttributeName: "viewId", KeyType: "RANGE" }],
      AttributeDefinitions: [{ AttributeName: "propertyId", AttributeType: "S" }, { AttributeName: "viewId", AttributeType: "S" }],
      BillingMode: "PAY_PER_REQUEST"
    },
    {
      TableName: TABLES.TOUR_PAYMENTS,
      KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
      AttributeDefinitions: [{ AttributeName: "id", AttributeType: "S" }],
      BillingMode: "PAY_PER_REQUEST"
    },
    {
      TableName: TABLES.SETTINGS,
      KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
      AttributeDefinitions: [{ AttributeName: "id", AttributeType: "S" }],
      BillingMode: "PAY_PER_REQUEST"
    }
  ];

  for (const tableDefinition of tableDefinitions) {
    try {
      console.log(`[DEBUG] Checking if table exists: ${tableDefinition.TableName}`);
      await client.send(new DescribeTableCommand({ TableName: tableDefinition.TableName }));
      console.log(`[DEBUG] Table ${tableDefinition.TableName} already exists`);
    } catch (error: any) {
      if (error.name === 'ResourceNotFoundException') {
        // Table doesn't exist, create it
        console.log(`[DEBUG] Table ${tableDefinition.TableName} does not exist. Creating...`);
        try {
          await client.send(new CreateTableCommand(tableDefinition));
          console.log(`[DEBUG] Table ${tableDefinition.TableName} created. Waiting for ACTIVE status...`);

          // Wait for table to be active
          let tableStatus = 'CREATING';
          let waitCount = 0;
          while (tableStatus !== 'ACTIVE') {
            waitCount++;
            console.log(`[DEBUG] Waiting for ${tableDefinition.TableName} to become ACTIVE (attempt ${waitCount})...`);
            await new Promise(resolve => setTimeout(resolve, 2000));
            const describeResult = await client.send(new DescribeTableCommand({ TableName: tableDefinition.TableName }));
            tableStatus = describeResult.Table?.TableStatus || 'UNKNOWN';
            console.log(`[DEBUG] Table ${tableDefinition.TableName} status: ${tableStatus}`);
            if (waitCount > 30) throw new Error(`Timeout waiting for table ${tableDefinition.TableName} to become ACTIVE`);
          }
        } catch (createError) {
          console.error(`[DEBUG] Failed to create table ${tableDefinition.TableName}:`, createError);
          throw createError;
        }
      } else {
        console.error(`[DEBUG] Error checking table ${tableDefinition.TableName}:`, error);
        throw error;
      }
    }
  }

  console.log("🎉 All tables are ready!");
}

// List all tables
export async function listTables(): Promise<string[]> {
  try {
    const result = await client.send(new ListTablesCommand({}));
    return result.TableNames || [];
  } catch (error) {
    console.error('Failed to list tables:', error);
    throw error;
  }
}

// Set up periodic health check (every 10 minutes)
const HEALTH_CHECK_INTERVAL = 10 * 60 * 1000; // 10 minutes in milliseconds

setInterval(async () => {
  try {
    await checkDynamoDBHealth();
  } catch (error) {
    console.error('Scheduled DynamoDB health check failed:', error);
  }
}, HEALTH_CHECK_INTERVAL);
