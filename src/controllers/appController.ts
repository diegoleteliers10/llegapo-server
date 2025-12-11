import { Request, Response } from "express";
import { HealthCheckResponse, APIDocumentation } from "../types";
import { formatUptime, formatMemoryUsage } from "../utils/formatters";
import { redClient } from "../utils/red-client";
import { asyncErrorHandler } from "../middleware/error-handler";

/**
 * Health check endpoint
 */
export const healthCheck = asyncErrorHandler(
  async (req: Request, res: Response) => {
    const healthData: HealthCheckResponse = {
      status: "ok",
      service: "LlegaPo Servidor",
      version: "1.0.0",
      timestamp: Date.now(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      endpoints: {
        arrivals: "/v1/stops/:codsimt/arrivals",
        arrivalsFormatted: "/v1/stops/:codsimt/arrivals/formatted",
        route: "/v1/routes/:codser",
        routeFormatted: "/v1/routes/:codser/formatted",
        fullRoute: "/v1/routes/:codser/full",
        routeStops: "/v1/routes/:codser/stops",
      },
    };

    // Agregar información adicional del estado del sistema
    const extendedHealth = {
      ...healthData,
      system: {
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
        uptimeFormatted: formatUptime(process.uptime()),
        memoryUsage: {
          rss: formatMemoryUsage(healthData.memory.rss),
          heapTotal: formatMemoryUsage(healthData.memory.heapTotal),
          heapUsed: formatMemoryUsage(healthData.memory.heapUsed),
          external: formatMemoryUsage(healthData.memory.external),
        },
      },
      redClient: {
        jwtCache: redClient.getJwtCacheInfo(),
      },
    };

    res.json(extendedHealth);
  },
);

/**
 * Legacy health check endpoint para backward compatibility
 */
export const legacyHealthCheck = (req: Request, res: Response) => {
  res.json({
    status: "OK",
    timestamp: new Date().toISOString(),
  });
};

/**
 * Documentación principal de la API
 */
export const apiDocumentation = (req: Request, res: Response) => {
  const baseUrl = `${req.protocol}://${req.get("host")}`;

  const documentation: APIDocumentation = {
    message: "🚀 LlegaPo API Wrapper para Red.cl",
    version: "1.0.0",
    description:
      "API para consultar tiempos de llegada y recorridos del transporte público de Santiago",
    documentation: {
      health: "GET /health - Estado del servicio",
      arrivals: {
        basic: "GET /v1/stops/:codsimt/arrivals - Tiempos de llegada",
        byService:
          "GET /v1/stops/:codsimt/arrivals/busId?busId=XXX - Arrivals de servicio específico",
        formatted:
          "GET /v1/stops/:codsimt/arrivals/formatted - Tiempos formateados",
      },
      routes: {
        basic: "GET /v1/routes/:codser - Recorrido del servicio",
        formatted: "GET /v1/routes/:codser/formatted - Recorrido formateado",
        full: "GET /v1/routes/:codser/full - Recorrido completo (ida y regreso)",
        stops: "GET /v1/routes/:codser/stops - Solo paraderos del servicio",
      },
    },
    examples: {
      "Arrivals PC205": `${baseUrl}/v1/stops/PC205/arrivals`,
      "Arrivals PC205 - Solo 405": `${baseUrl}/v1/stops/PC205/arrivals/busId?busId=405`,
      "Arrivals PC205 formateados": `${baseUrl}/v1/stops/PC205/arrivals/formatted`,
      "Recorrido 405": `${baseUrl}/v1/routes/405`,
      "Recorrido 405 completo": `${baseUrl}/v1/routes/405/full`,
      "Paraderos del 405": `${baseUrl}/v1/routes/405/stops`,
      "Health Check": `${baseUrl}/health`,
    },
    limits: {
      arrivals: "10 requests por minuto",
      routes: "20 requests por 5 minutos",
      general: "100 requests por 15 minutos",
    },
  };

  // Agregar información adicional en desarrollo
  if (process.env.NODE_ENV === "development") {
    documentation.github = "https://github.com/tu-usuario/llegapo-servidor";
  }

  res.json(documentation);
};

/**
 * Endpoint para obtener estadísticas generales del sistema
 */
export const getSystemStats = asyncErrorHandler(
  async (req: Request, res: Response) => {
    const stats = {
      system: {
        uptime: process.uptime(),
        uptimeFormatted: formatUptime(process.uptime()),
        memory: {
          rss: formatMemoryUsage(process.memoryUsage().rss),
          heapTotal: formatMemoryUsage(process.memoryUsage().heapTotal),
          heapUsed: formatMemoryUsage(process.memoryUsage().heapUsed),
          heapUsedPercent: Math.round(
            (process.memoryUsage().heapUsed / process.memoryUsage().heapTotal) *
              100,
          ),
        },
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
      },
      redClient: {
        config: redClient.getConfig(),
        jwtCache: redClient.getJwtCacheInfo(),
      },
      environment: {
        nodeEnv: process.env.NODE_ENV || "development",
        port: process.env.PORT || "3000",
        host: process.env.HOST || "localhost",
      },
      timestamp: Date.now(),
    };

    res.json({
      success: true,
      data: stats,
      timestamp: Date.now(),
    });
  },
);

/**
 * Endpoint para limpiar cache JWT (útil para debugging)
 */
export const clearJwtCache = asyncErrorHandler(
  async (req: Request, res: Response): Promise<void> => {
    // Solo permitir en desarrollo
    if (process.env.NODE_ENV !== "development") {
      res.status(403).json({
        success: false,
        error: "Operación no permitida en producción",
        timestamp: Date.now(),
      });
      return;
    }

    console.log("🧹 Limpiando cache JWT por request manual");
    redClient.invalidateJwtCache();

    res.json({
      success: true,
      message: "Cache JWT limpiado exitosamente",
      timestamp: Date.now(),
    });
  },
);

/**
 * Endpoint para información de endpoints disponibles
 */
export const getEndpointsInfo = (req: Request, res: Response) => {
  const baseUrl = `${req.protocol}://${req.get("host")}`;

  const endpoints = {
    general: {
      documentation: `${baseUrl}/`,
      health: `${baseUrl}/health`,
      legacyHealth: `${baseUrl}/api/health`,
      stats: `${baseUrl}/v1/system/stats`,
      endpoints: `${baseUrl}/v1/endpoints`,
    },
    stops: {
      arrivals: `${baseUrl}/v1/stops/:codsimt/arrivals`,
      arrivalsByService: `${baseUrl}/v1/stops/:codsimt/arrivals/busId?busId=XXX`,
      arrivalsFormatted: `${baseUrl}/v1/stops/:codsimt/arrivals/formatted`,
      enhanced: `${baseUrl}/v1/stops/:codsimt/enhanced`,
      info: `${baseUrl}/v1/stops/:codsimt/info`,
      statistics: `${baseUrl}/v1/stops/:codsimt/statistics?samples=3&interval=30000`,
    },
    routes: {
      basic: `${baseUrl}/v1/routes/:codser`,
      formatted: `${baseUrl}/v1/routes/:codser/formatted`,
      full: `${baseUrl}/v1/routes/:codser/full`,
      stops: `${baseUrl}/v1/routes/:codser/stops`,
      search: `${baseUrl}/v1/routes/:codser/search?search=termino`,
      schedules: `${baseUrl}/v1/routes/:codser/schedules`,
      info: `${baseUrl}/v1/routes/:codser/info`,
      compare: `${baseUrl}/v1/routes/:codser/compare?compare=otroServicio`,
    },
  };

  res.json({
    success: true,
    data: {
      message: "Endpoints disponibles en la API",
      totalEndpoints: Object.values(endpoints).reduce(
        (total, category) => total + Object.keys(category).length,
        0,
      ),
      endpoints,
      examples: {
        stopArrival: endpoints.stops.arrivals.replace(":codsimt", "PC205"),
        stopArrivalByService: `${baseUrl}/v1/stops/PC205/arrivals/busId?busId=405`,
        routeInfo: endpoints.routes.basic.replace(":codser", "405"),
        routeSearch: endpoints.routes.search
          .replace(":codser", "405")
          .replace("termino", "baquedano"),
      },
    },
    timestamp: Date.now(),
  });
};

/**
 * Ping endpoint simple para verificar conectividad
 */
export const ping = (req: Request, res: Response) => {
  res.json({
    message: "pong",
    timestamp: Date.now(),
    ip: req.ip,
    userAgent: req.get("User-Agent"),
  });
};

/**
 * Endpoint para obtener versión de la API
 */
export const getVersion = (req: Request, res: Response) => {
  res.json({
    name: "LlegaPo API",
    version: "1.0.0",
    description: "API Wrapper para Red.cl - Transporte Público Santiago",
    author: "Diego",
    license: "ISC",
    repository: "https://github.com/tu-usuario/llegapo-servidor",
    timestamp: Date.now(),
  });
};
