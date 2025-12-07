// Script to mark existing users as verified (optional)
// This helps avoid disrupting existing users when email verification is implemented
// Run with: node scripts/verify-existing-users.js

import AWS from 'aws-sdk';

// Configure AWS (using cloud DynamoDB)
AWS.config.update({
  region: 'eu-north-1',
  accessKeyId: process.env.ACCESS_KEY_ID,
  secretAccessKey: process.env.SECRET_ACCESS_KEY
});

const dynamodb = new AWS.DynamoDB.DocumentClient();

async function verifyExistingUsers() {
  console.log('🔍 Checking for existing unverified users...');

  try {
    // Scan all users from DynamoDB
    const scanParams = {
      TableName: 'realevr-users'
    };

    const result = await dynamodb.scan(scanParams).promise();
    const users = result.Items || [];

    console.log(`📊 Found ${users.length} total users`);

    // Find users who are unverified but don't have verification tokens
    const existingUnverifiedUsers = users.filter(user =>
      !user.is_verified && !user.email_verification_token
    );

    console.log(`👥 Found ${existingUnverifiedUsers.length} existing unverified users (without verification tokens)`);

    if (existingUnverifiedUsers.length === 0) {
      console.log('✅ No existing unverified users found. All good!');
      return;
    }

    console.log('\n📋 Existing unverified users:');
    existingUnverifiedUsers.forEach((user, index) => {
      console.log(`${index + 1}. ${user.username} (${user.email}) - ID: ${user.id}`);
    });

    console.log('\n⚡ Marking all existing users as verified...');

    let verifiedCount = 0;
    for (const user of existingUnverifiedUsers) {
      try {
        const updateParams = {
          TableName: 'realevr-users',
          Key: { id: user.id },
          UpdateExpression: 'SET is_verified = :verified',
          ExpressionAttributeValues: {
            ':verified': true
          }
        };

        await dynamodb.update(updateParams).promise();
        console.log(`✅ Verified user: ${user.username}`);
        verifiedCount++;
      } catch (error) {
        console.error(`❌ Failed to verify user ${user.username}:`, error.message);
      }
    }

    console.log(`\n🎉 Successfully verified ${verifiedCount} existing users!`);
    console.log('📝 These users can now log in normally.');
    console.log('🆕 New users will still need to verify their email addresses.');

  } catch (error) {
    console.error('❌ Error during verification process:', error);
  }
}

// Run the script
verifyExistingUsers()
  .then(() => {
    console.log('\n✨ Script completed!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Script failed:', error);
    process.exit(1);
  });
