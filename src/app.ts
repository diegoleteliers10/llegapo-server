import dotenv from "dotenv";
dotenv.config();

import express from "express";

import cors from "cors";

import helmet from "helmet";

import morgan from "morgan";

// Middleware imports
import {
  stopArrivalsLimiter,
  routeLimiter,
  generalLimiter,
  additionalSecurityHeaders,
  securityLogger,
  corsOptions,
  validateApiKey,
} from "./middleware/security";
import {
  errorHandler,
  errorLogger,
  notFoundHandler,
  requestTimeout,
  validateResponse,
} from "./middleware/error-handler";

// Controller imports
import {
  getStopArrivals,
  getStopArrivalsFormatted,
  getStopArrivalsEnhanced,
  getStopStatistics,
  getStopInfo,
  getStopArrivalsByService,
  validateStopParams,
} from "./controllers/stopController";
import {
  getRoute,
  getRouteFormatted,
  getFullRoute,
  getRouteStops,
  searchStopsInRoute,
  getRouteSchedules,
  getServiceInfo,
  compareRoutes,
  validateRouteParams,
} from "./controllers/routeController";
import {
  healthCheck,
  legacyHealthCheck,
  apiDocumentation,
  getSystemStats,
  clearJwtCache,
  getEndpointsInfo,
  ping,
  getVersion,
} from "./controllers/appController";

const NODE_ENV = process.env.NODE_ENV || "development";
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "localhost";

const app = express();

// 🔧 Trust proxy configuración específica para entorno controlado por NODE_ENV

if (NODE_ENV === "production") {
  // En producción (Vercel), confiar solo en el primer proxy

  app.set("trust proxy", 1);
} else {
  // En desarrollo local, no confiar en proxies

  app.set("trust proxy", false);
}

// 🛡️ Security middleware (aplicado primero)
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"],
      },
    },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    },
  }),
);

app.use(additionalSecurityHeaders);

// 🌐 CORS configuration
app.use(cors(corsOptions));

// 📦 Body parsing middleware
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// 🕐 Request timeout
app.use(requestTimeout(30000)); // 30 segundos

// 📝 Logging middleware
app.use(
  morgan("combined", {
    skip: (req, res) =>
      res.statusCode < 400 && (req.url === "/health" || req.url === "/ping"),
  }),
);

app.use(securityLogger);

// 🔐 Rate limiting general
app.use(generalLimiter);

// 🔑 API Key validation (opcional)
app.use(validateApiKey);

// 📊 Response validation
app.use(validateResponse);

// 🔍 Error logging middleware
app.use(errorLogger);

// ===== RUTAS PRINCIPALES =====

// 📖 Documentación y endpoints generales
app.get("/", apiDocumentation);
app.get("/health", healthCheck);
app.get("/api/health", legacyHealthCheck);
app.get("/ping", ping);
app.get("/version", getVersion);

// 📊 Endpoints del sistema
app.get("/v1/endpoints", getEndpointsInfo);
app.get("/v1/system/stats", getSystemStats);

// 🧹 Endpoints de mantenimiento (solo desarrollo)
if (process.env.NODE_ENV === "development") {
  app.post("/v1/system/clear-jwt-cache", clearJwtCache);
}

// 🔍 Endpoint de debug JWT temporal para Vercel
app.get(
  "/debug/jwt",
  async (_req: express.Request, res: express.Response): Promise<void> => {
    try {
      const { redClient } = await import("./utils/red-client");

      // Información del entorno
      const envInfo = {
        nodeEnv: process.env.NODE_ENV,
        platform: process.platform,
        vercelRegion: process.env.VERCEL_REGION,
        vercelUrl: process.env.VERCEL_URL,
      };

      // Estado actual del JWT
      const jwtInfo = redClient.getJwtCacheInfo();

      // Invalidar cache para forzar refresh
      redClient.invalidateJwtCache();

      console.log("🔍 Debug: Intentando obtener JWT para diagnóstico...");

      // Intentar obtener arrivals de prueba
      const testResult = await redClient.getStopArrivals("PC205");

      res.json({
        success: true,
        environment: envInfo,
        jwt: {
          ...jwtInfo,
          tokenLength: jwtInfo.hasToken
            ? jwtInfo.hasToken.toString().length
            : 0,
          tokenPreview: jwtInfo.hasToken ? "Token presente" : "No token",
        },
        test: {
          success: true,
          arrivalsFound: testResult.servicios?.item?.length || 0,
          hasData: Boolean(testResult.servicios?.item),
        },
        timestamp: Date.now(),
      });
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error("🔍 Debug error:", errorMessage);

      res.status(500).json({
        success: false,
        error: errorMessage,
        environment: {
          nodeEnv: process.env.NODE_ENV,
          platform: process.platform,
          vercelRegion: process.env.VERCEL_REGION,
        },
        timestamp: Date.now(),
      });
    }
  },
);

// ===== RUTAS DE PARADEROS =====

// Middleware de validación para todas las rutas de paraderos
app.use("/v1/stops/:codsimt/:action", validateStopParams);

// 🚍 Arrivals básicos
app.get("/v1/stops/:codsimt/arrivals", stopArrivalsLimiter, getStopArrivals);

// 🚍 Arrivals de servicio específico
app.get(
  "/v1/stops/:codsimt/arrivals/busId",
  stopArrivalsLimiter,
  validateStopParams,
  getStopArrivalsByService,
);

// 🚍 Arrivals formateados
app.get(
  "/v1/stops/:codsimt/arrivals/formatted",
  stopArrivalsLimiter,
  getStopArrivalsFormatted,
);

// 🚍 Arrivals con análisis mejorado
app.get(
  "/v1/stops/:codsimt/enhanced",
  stopArrivalsLimiter,
  getStopArrivalsEnhanced,
);

// 🚍 Información general del paradero
app.get("/v1/stops/:codsimt/info", getStopInfo);

// 📊 Estadísticas del paradero
app.get("/v1/stops/:codsimt/statistics", getStopStatistics);

// ===== RUTAS DE SERVICIOS =====

// 🛣️ Recorrido básico
app.get("/v1/routes/:codser", routeLimiter, validateRouteParams, getRoute);

// 🛣️ Recorrido formateado
app.get(
  "/v1/routes/:codser/formatted",
  routeLimiter,
  validateRouteParams,
  getRouteFormatted,
);

// 🛣️ Recorrido completo (ida y regreso)
app.get(
  "/v1/routes/:codser/full",
  routeLimiter,
  validateRouteParams,
  getFullRoute,
);

// 🛣️ Solo paraderos del recorrido
app.get(
  "/v1/routes/:codser/stops",
  routeLimiter,
  validateRouteParams,
  getRouteStops,
);

// 🔍 Buscar paraderos en el recorrido
app.get(
  "/v1/routes/:codser/search",
  routeLimiter,
  validateRouteParams,
  searchStopsInRoute,
);

// ⏰ Horarios del servicio
app.get(
  "/v1/routes/:codser/schedules",
  routeLimiter,
  validateRouteParams,
  getRouteSchedules,
);

// ℹ️ Información general del servicio
app.get("/v1/routes/:codser/info", validateRouteParams, getServiceInfo);

// ⚖️ Comparar servicios
app.get(
  "/v1/routes/:codser/compare",
  routeLimiter,
  validateRouteParams,
  compareRoutes,
);

// ===== RUTAS ESPECIALES =====

// 🔍 Endpoints de búsqueda global (futuro)
// app.get('/v1/search/stops', searchGlobalStops);
// app.get('/v1/search/routes', searchGlobalRoutes);

// 📱 Endpoints móviles optimizados (futuro)
// app.get('/v1/mobile/nearby-stops', getNearbyStops);
// app.get('/v1/mobile/favorites', getUserFavorites);

// 🗺️ Endpoints de mapas (futuro)
// app.get('/v1/map/stops', getStopsForMap);
// app.get('/v1/map/routes/:codser/path', getRoutePathForMap);

// ===== ERROR HANDLING =====

// 🚫 404 handler - debe ir antes del error handler general
app.use(notFoundHandler);

// 💥 Error handler global - debe ir al final
app.use(errorHandler);

// ===== CONFIGURACIÓN DEL SERVIDOR =====

/* PORT definido arriba; se elimina duplicado */

/* HOST definido arriba; se elimina duplicado */

// Función para iniciar el servidor
export function startServer(): void {
  app.listen(PORT, () => {
    console.log(`
🚀 LlegaPo corriendo exitosamente!
📍 Host: http://${HOST}:${PORT}
📖 Docs: http://${HOST}:${PORT}/
🏥 Health: http://${HOST}:${PORT}/health
🔍 Endpoints: http://${HOST}:${PORT}/v1/endpoints

📍 Endpoints de Paraderos:
   GET /v1/stops/:codsimt/arrivals          - Tiempos de llegada básicos
   GET /v1/stops/:codsimt/arrivals/busId    - Arrivals de servicio específico
   GET /v1/stops/:codsimt/arrivals/formatted - Tiempos formateados
   GET /v1/stops/:codsimt/enhanced          - Arrivals con análisis
   GET /v1/stops/:codsimt/info              - Información del paradero
   GET /v1/stops/:codsimt/statistics        - Estadísticas del paradero

🛣️ Endpoints de Servicios:
   GET /v1/routes/:codser                   - Recorrido básico
   GET /v1/routes/:codser/formatted         - Recorrido formateado
   GET /v1/routes/:codser/full              - Recorrido completo
   GET /v1/routes/:codser/stops             - Solo paraderos
   GET /v1/routes/:codser/search            - Buscar paraderos
   GET /v1/routes/:codser/schedules         - Horarios del servicio
   GET /v1/routes/:codser/info              - Info del servicio
   GET /v1/routes/:codser/compare           - Comparar servicios

🧪 Ejemplos de uso:
   curl http://${HOST}:${PORT}/v1/stops/PC205/arrivals
   curl "http://${HOST}:${PORT}/v1/stops/PC205/arrivals/busId?busId=405"
   curl http://${HOST}:${PORT}/v1/routes/405/formatted
   curl http://${HOST}:${PORT}/v1/routes/405/stops
   curl http://${HOST}:${PORT}/health

🔐 Rate limits aplicados:
   - Arrivals: 10 req/min por IP
   - Routes: 20 req/5min por IP
   - General: 100 req/15min por IP

🌍 Entorno: ${process.env.NODE_ENV || "development"}
🎯 Consumiendo APIs de Red.cl para Santiago de Chile

${process.env.NODE_ENV === "development" ? "🛠️  Modo desarrollo activado - Rate limits relajados para localhost" : "🔒 Modo producción - Todas las protecciones activadas"}
    `);
  });
}

// Manejo de errores no capturados
process.on("uncaughtException", (error) => {
  console.error("💥 Uncaught Exception:", error);
  process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("💥 Unhandled Rejection at:", promise, "reason:", reason);
  process.exit(1);
});

// Manejo de señales de terminación
process.on("SIGTERM", () => {
  console.log("👋 Received SIGTERM, shutting down gracefully");
  process.exit(0);
});

process.on("SIGINT", () => {
  console.log("👋 Received SIGINT, shutting down gracefully");
  process.exit(0);
});

export default app;

// Auto-iniciar servidor si este archivo es ejecutado directamente
if (require.main === module) {
  startServer();
}
