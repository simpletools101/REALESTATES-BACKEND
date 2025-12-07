// Simple test script to verify email service works
// Run with: node test-email.js

const { sendEmail, generateVerificationEmailHTML, generateVerificationEmailText } = require('./server/email-service');

async function testEmailService() {
  console.log('Testing email service...');
  
  const testEmail = 'test@example.com';
  const testName = 'Test User';
  const testToken = 'test-token-123';
  const verificationUrl = `http://localhost:5000/api/verify-email?token=${testToken}`;
  
  const emailOptions = {
    to: testEmail,
    subject: 'Test Email - RealEVR Estates',
    html: generateVerificationEmailHTML(verificationUrl, testName),
    text: generateVerificationEmailText(verificationUrl, testName),
  };
  
  try {
    const result = await sendEmail(emailOptions);
    
    if (result) {
      console.log('✅ Email service test passed!');
      console.log('📧 Test email would be sent to:', testEmail);
      console.log('🔗 Verification URL:', verificationUrl);
    } else {
      console.log('❌ Email service test failed');
    }
  } catch (error) {
    console.error('❌ Email service error:', error.message);
  }
}

// Run the test
testEmailService();
