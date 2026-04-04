export function validateEnv(): void {
  const required = [
    'FIREBASE_PROJECT_ID',
    'FIREBASE_CLIENT_EMAIL',
    'FIREBASE_PRIVATE_KEY',
    'MERCADOPAGO_ACCESS_TOKEN',
    'WEBHOOK_SECRET',
    'LALAMOVE_API_KEY',
    'LALAMOVE_API_SECRET',
    'JWT_SECRET',
    'DASHBOARD_USER',
    'DASHBOARD_PASS',
    'FRONTEND_URL',
  ];
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}
