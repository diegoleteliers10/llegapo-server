import app from "./src/app";

// Bootstrap file that references the main Express app from src/app.ts.
// This allows a single codebase to be used for both local development and deploy.
// - In deploy (e.g., Vercel), the default export is used as the handler.
// - When executed directly (node dist/index.js), it will start the HTTP server.

export default app;

// Start server only when this file is executed directly (not in serverless platforms)
if (require.main === module) {
  const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;
  const HOST = process.env.HOST || "0.0.0.0";

  app.listen(PORT, HOST, () => {
    // Minimal runtime log
    // Avoid verbose logs here to keep bootstrap clean
    console.log(`Server listening at http://${HOST}:${PORT}`);
  });
}
