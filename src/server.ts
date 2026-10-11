import app, { configureExpress } from "./app";
import { config } from "./config";
import { routers } from "./context";
import { createServer, Server } from "http";

const SHUTDOWN_TIMEOUT_MS = 10_000;

let shuttingDown = false;

/**
 * Gracefully shuts down the HTTP server when the process receives a
 * termination signal (SIGINT from Ctrl+C, SIGTERM from Docker/Kubernetes/PM2).
 *
 * - Stops accepting new connections and exits with code 0 once all in-flight
 *   requests have finished.
 * - Closes idle keep-alive sockets immediately so they don't hold the server open.
 * - Force-closes remaining connections and exits with code 1 if shutdown takes
 *   longer than `SHUTDOWN_TIMEOUT_MS`, so a hung request can't block exit.
 *   Keep this below the orchestrator's grace period (Docker 10s, Kubernetes 30s)
 *   so the process exits on its own terms before being SIGKILLed.
 * - Repeated signals (e.g. pressing Ctrl+C twice) are ignored once shutdown
 *   has started.
 *
 * @param server - The HTTP server to close.
 * @param signal - The signal that triggered the shutdown, used for logging.
 */
const _shutdown = (server: Server, signal: NodeJS.Signals) => {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal} received, shutting down`);

  // Stop accepting new connections; the callback fires once in-flight requests finish.
  server.close((err) => {
    if (err) {
      console.error("Error during shutdown", err);
      process.exit(1);
    }
    process.exit(0);
  });
  // Idle keep-alive sockets would otherwise hold server.close() open.
  server.closeIdleConnections();

  // Don't hang forever on slow requests. unref() so this timer alone never keeps the process alive.
  setTimeout(() => {
    console.error("Shutdown timed out, forcing exit");
    server.closeAllConnections();
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS).unref();
};

const main = async () => {
  configureExpress(app, routers);
  const server = createServer(app);

  server.listen(config.port, () => {
    console.log(`Server listening on ${config.port} (${config.nodeEnv})`);
  });

  process.on("SIGINT", (signal) => _shutdown(server, signal));
  process.on("SIGTERM", (signal) => _shutdown(server, signal));
};

main().catch((err) => {
  console.error("Failed to start server", err);
  process.exit(1);
});
