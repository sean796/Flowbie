/**
 * DataForSEO API Diagnostic Test Script
 *
 * Run with: node test-dataforseo.js
 * Set env vars (or use .env): DATAFORSEO_API_LOGIN, DATAFORSEO_API_PASSWORD
 *
 * This script tests:
 * 1. Backend server health
 * 2. Backend keyword_overview endpoint
 * 3. DataForSEO API direct connection (only if credentials are set)
 */

const axios = require('axios');

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3001';
const DATAFORSEO_API = 'https://api.dataforseo.com/v3';

// Credentials from env only (never commit secrets)
const CREDENTIALS = {
  api_login: process.env.DATAFORSEO_API_LOGIN || '',
  api_password: process.env.DATAFORSEO_API_PASSWORD || ''
};

const hasCredentials = !!(CREDENTIALS.api_login && CREDENTIALS.api_password);
const auth = hasCredentials
  ? Buffer.from(`${CREDENTIALS.api_login}:${CREDENTIALS.api_password}`).toString('base64')
  : '';

console.log('='.repeat(60));
console.log('DataForSEO API Diagnostic Test');
console.log('='.repeat(60));
console.log('');

// Test 1: Backend Server Health
async function testBackendHealth() {
  console.log('Test 1: Backend Server Health Check');
  console.log('-'.repeat(60));
  try {
    const response = await axios.get(`${BACKEND_URL}/api/mcp/health`);
    console.log('✅ Backend server is running');
    console.log('Response:', JSON.stringify(response.data, null, 2));
    return true;
  } catch (error) {
    console.log('❌ Backend server is NOT running or not accessible');
    console.log('Error:', error.message);
    if (error.code === 'ECONNREFUSED') {
      console.log('\n💡 Solution: Start the backend server with:');
      console.log('   node server/mcp-api-server.js');
    }
    return false;
  }
}

// Test 2: Backend Keyword Overview Endpoint
async function testBackendEndpoint() {
  console.log('\nTest 2: Backend Keyword Overview Endpoint');
  console.log('-'.repeat(60));
  try {
    const response = await axios.post(
      `${BACKEND_URL}/api/mcp/DataForSEO_dataforseo_labs_google_keyword_overview`,
      {
        keywords: ['test keyword'],
        location_name: 'United States',
        language_code: 'en'
      },
      {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 30000
      }
    );
    
    console.log('✅ Backend endpoint responded');
    console.log('Status:', response.status);
    
    if (response.data.status_code === 20000) {
      console.log('✅ DataForSEO API returned success');
      console.log('Tasks:', response.data.tasks_count);
      console.log('Errors:', response.data.tasks_error);
    } else {
      console.log('⚠️  DataForSEO API returned error:');
      console.log('Status Code:', response.data.status_code);
      console.log('Status Message:', response.data.status_message);
    }
    
    return true;
  } catch (error) {
    console.log('❌ Backend endpoint failed');
    console.log('Status:', error.response?.status);
    console.log('Error:', error.message);
    
    if (error.response?.data) {
      console.log('Response Data:', JSON.stringify(error.response.data, null, 2));
    }
    
    return false;
  }
}

// Test 3: DataForSEO API Direct Connection
async function testDataForSEODirect() {
  console.log('\nTest 3: DataForSEO API Direct Connection');
  console.log('-'.repeat(60));
  if (!hasCredentials) {
    console.log('⏭️  Skipped (set DATAFORSEO_API_LOGIN and DATAFORSEO_API_PASSWORD to run)');
    return null;
  }
  try {
    const requestBody = [{
      keywords: ['test keyword'],
      location_code: 2840,
      language_code: 'en'
    }];
    
    console.log('Request body:', JSON.stringify(requestBody, null, 2));
    
    const response = await axios.post(
      `${DATAFORSEO_API}/dataforseo_labs/google/keyword_overview/live`,
      requestBody,
      {
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      }
    );
    
    console.log('✅ DataForSEO API connection successful');
    console.log('HTTP Status:', response.status);
    console.log('API Status Code:', response.data.status_code);
    console.log('API Status Message:', response.data.status_message);
    console.log('Tasks:', response.data.tasks_count);
    console.log('Errors:', response.data.tasks_error);
    
    if (response.data.tasks && response.data.tasks[0]) {
      const task = response.data.tasks[0];
      console.log('\nTask Details:');
      console.log('  Task Status Code:', task.status_code);
      console.log('  Task Status Message:', task.status_message);
      console.log('  Result Count:', task.result_count);
      
      if (task.result && task.result.length > 0) {
        console.log('  ✅ Results returned:', task.result.length);
      } else {
        console.log('  ⚠️  No results in response');
      }
    }
    
    return true;
  } catch (error) {
    console.log('❌ DataForSEO API direct connection failed');
    console.log('HTTP Status:', error.response?.status);
    console.log('Error:', error.message);
    
    if (error.response?.data) {
      console.log('\nDataForSEO API Response:');
      console.log(JSON.stringify(error.response.data, null, 2));
      
      if (error.response.data.status_code) {
        console.log('\nAPI Status Code:', error.response.data.status_code);
        console.log('API Status Message:', error.response.data.status_message);
      }
    }
    
    if (error.response?.status === 401) {
      console.log('\n💡 Solution: Set DATAFORSEO_API_LOGIN and DATAFORSEO_API_PASSWORD (e.g. in .env)');
      console.log('   Verify API login and password are correct');
    }
    
    if (error.response?.status === 500) {
      console.log('\n💡 Solution: DataForSEO API may be experiencing issues');
      console.log('   Try again in 30 seconds');
      console.log('   Contact DataForSEO support if issue persists');
    }
    
    return false;
  }
}

// Test 4: Verify Credentials Encoding
function testCredentialsEncoding() {
  console.log('\nTest 4: Credentials Encoding');
  console.log('-'.repeat(60));
  if (!hasCredentials) {
    console.log('⏭️  Skipped (set DATAFORSEO_API_LOGIN and DATAFORSEO_API_PASSWORD to run)');
    return null;
  }
  const encoded = Buffer.from(`${CREDENTIALS.api_login}:${CREDENTIALS.api_password}`).toString('base64');
  console.log('Login:', CREDENTIALS.api_login ? '(set)' : '(missing)');
  console.log('Password:', CREDENTIALS.api_password ? '(set)' : '(missing)');
  console.log('Base64 Encoded:', encoded ? `${encoded.substring(0, 12)}...` : '(none)');
  if (encoded.includes(' ') || encoded.includes('\n')) {
    console.log('❌ Base64 contains spaces or newlines - this will cause auth failures');
    return false;
  }
  console.log('✅ Base64 encoding is correct (no spaces/newlines)');
  return true;
}

// Run all tests
async function runAllTests() {
  const results = {
    backendHealth: false,
    backendEndpoint: false,
    dataForSEODirect: false,
    credentialsEncoding: false
  };
  
  results.credentialsEncoding = testCredentialsEncoding();
  results.backendHealth = await testBackendHealth();

  if (results.backendHealth) {
    results.backendEndpoint = await testBackendEndpoint();
  }

  results.dataForSEODirect = await testDataForSEODirect();

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('Test Summary');
  console.log('='.repeat(60));
  const encStr = results.credentialsEncoding === null ? 'SKIP' : (results.credentialsEncoding ? '✅ PASS' : '❌ FAIL');
  const directStr = results.dataForSEODirect === null ? 'SKIP' : (results.dataForSEODirect ? '✅ PASS' : '❌ FAIL');
  console.log('Credentials Encoding:', encStr);
  console.log('Backend Health:', results.backendHealth ? '✅ PASS' : '❌ FAIL');
  console.log('Backend Endpoint:', results.backendEndpoint ? '✅ PASS' : '❌ FAIL');
  console.log('DataForSEO Direct:', directStr);
  console.log('');

  const allRequiredPassed = results.backendHealth && results.backendEndpoint &&
    (results.dataForSEODirect !== false) && (results.credentialsEncoding !== false);
  if (allRequiredPassed && results.dataForSEODirect && results.credentialsEncoding) {
    console.log('✅ All tests passed! Integration should be working.');
  } else if (results.backendHealth && results.backendEndpoint && !hasCredentials) {
    console.log('✅ Backend tests passed. Set DATAFORSEO_API_LOGIN and DATAFORSEO_API_PASSWORD to run direct API test.');
  } else {
    console.log('❌ Some tests failed. Review the output above for details.');
    console.log('\nSee DATAFORSEO_500_ERROR_TROUBLESHOOTING.md for detailed troubleshooting steps.');
  }
}

// Run tests
runAllTests().catch(error => {
  console.error('\n❌ Test script error:', error.message);
  process.exit(1);
});

