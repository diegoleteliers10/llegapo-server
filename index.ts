const express = require("express");
const axios = require("axios");
const rateLimit = require("express-rate-limit");
const helmet = require("helmet");
const cors = require("cors");
const morgan = require("morgan");

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || "localhost";

// 🌐 Red.cl API Configuration
const RED_BASE = "https://www.red.cl";
const PREDICTOR_ENDPOINT = "/predictorPlus/prediccion";
const ROUTE_ENDPOINT = "/restservice_v2/rest/conocerecorrido";

// 🔧 JWT Token Cache
let jwtToken = "";
let tokenExpiry = 0;

// 🛡️ Security Middleware
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

app.use(
  cors({
    origin: process.env.ALLOWED_ORIGINS
      ? process.env.ALLOWED_ORIGINS.split(",")
      : "*",
    credentials: true,
    optionsSuccessStatus: 200,
  }),
);

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// 📝 Logger (skip health checks)
app.use(
  morgan("combined", {
    skip: (req, res) => res.statusCode < 400 && req.url === "/health",
  }),
);

// 🔐 Rate Limiters
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100,
  message: {
    error: "Demasiadas requests generales, relájate po 😎",
    retryAfter: 900,
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({
      success: false,
      error: "Demasiadas requests generales, relájate po 😎",
      retryAfter: 900,
      timestamp: Date.now(),
    });
  },
});

const stopArrivalsLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minuto
  max: 10,
  message: {
    error: "Demasiadas requests para arrivals, espera po 😎",
    retryAfter: 60,
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({
      success: false,
      error: "Demasiadas requests para arrivals, espera po 😎",
      retryAfter: 60,
      timestamp: Date.now(),
    });
  },
});

const routeLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutos
  max: 20,
  message: {
    error: "Demasiadas requests para rutas, espera po 😎",
    retryAfter: 300,
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({
      success: false,
      error: "Demasiadas requests para rutas, espera po 😎",
      retryAfter: 300,
      timestamp: Date.now(),
    });
  },
});

// Apply general rate limiting
app.use(generalLimiter);

// 🔧 Utility Functions
async function refreshJwt() {
  // Si el token aún es válido (5 minutos de cache), no lo refrescamos
  if (jwtToken && Date.now() < tokenExpiry) {
    return;
  }

  try {
    const pageUrl = `${RED_BASE}/planifica-tu-viaje/cuando-llega/?codsimt=PC205`;
    const { data: html } = await axios.get(pageUrl, {
      timeout: 10000,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
      },
    });

    // Buscar el token JWT en el HTML
    const jwtMatch = html.match(/\$jwt\s*=\s*'([^']+)'/);
    if (jwtMatch) {
      jwtToken = Buffer.from(jwtMatch[1], "base64").toString("utf-8");
      // Cache por 5 minutos
      tokenExpiry = Date.now() + 5 * 60 * 1000;
      console.log("🔑 JWT token refrescado exitosamente");
    } else {
      throw new Error("No se pudo extraer el token JWT del HTML");
    }
  } catch (error) {
    console.error("❌ Error al refrescar JWT:", error);
    throw new Error("No se pudo obtener token de autenticación");
  }
}

async function getStopArrivals(codsimt) {
  await refreshJwt();

  const url = `${RED_BASE}${PREDICTOR_ENDPOINT}?t=${jwtToken}&codsimt=${codsimt}&codser=`;
  const { data } = await axios.get(url, {
    timeout: 10000,
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
      Referer: "https://www.red.cl/planifica-tu-viaje/cuando-llega/",
    },
  });
  return data;
}

async function getRoute(codser) {
  const url = `${RED_BASE}${ROUTE_ENDPOINT}?codsint=${encodeURIComponent(codser)}`;
  const { data } = await axios.get(url, {
    timeout: 10000,
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
    },
  });
  return data;
}

function validateStopCode(codsimt) {
  if (!codsimt) {
    return { valid: false, error: "Código de paradero es requerido" };
  }

  if (codsimt.length < 3) {
    return {
      valid: false,
      error: "Código de paradero debe tener al menos 3 caracteres",
    };
  }

  if (codsimt.length > 10) {
    return { valid: false, error: "Código de paradero muy largo" };
  }

  const validPattern = /^[A-Za-z0-9]+$/;
  if (!validPattern.test(codsimt)) {
    return {
      valid: false,
      error: "Código de paradero solo puede contener letras y números",
    };
  }

  return { valid: true };
}

function validateServiceCode(codser) {
  if (!codser) {
    return { valid: false, error: "Código de servicio es requerido" };
  }

  if (codser.length < 1) {
    return {
      valid: false,
      error: "Código de servicio debe tener al menos 1 carácter",
    };
  }

  if (codser.length > 10) {
    return { valid: false, error: "Código de servicio muy largo" };
  }

  const validPattern = /^[A-Za-z0-9\-_]+$/;
  if (!validPattern.test(codser)) {
    return {
      valid: false,
      error: "Código de servicio contiene caracteres inválidos",
    };
  }

  return { valid: true };
}

function formatArrivals(arrivals) {
  return arrivals.map((arrival) => ({
    servicio: arrival.servicio,
    destino: arrival.destino,
    buses: [
      {
        distancia: arrival.distanciabus1,
        tiempo: arrival.horaprediccionbus1,
        patente: arrival.ppubus1,
      },
      ...(arrival.distanciabus2
        ? [
            {
              distancia: arrival.distanciabus2,
              tiempo: arrival.horaprediccionbus2 || "",
              patente: arrival.ppubus2 || "",
            },
          ]
        : []),
    ].filter((bus) => bus.distancia && bus.tiempo),
  }));
}

function formatRoute(route) {
  return {
    destino: route.destino,
    totalParaderos: route.paraderos.length,
    paraderos: route.paraderos.map((p) => ({
      codigo: p.cod,
      nombre: p.name,
      comuna: p.comuna,
      ubicacion: {
        latitud: p.pos[0],
        longitud: p.pos[1],
      },
    })),
    recorrido: {
      puntos: route.path.length,
      coordenadas: route.path.map((point) => ({
        longitud: point[0],
        latitud: point[1],
      })),
    },
    horarios: route.horarios.map((h) => ({
      tipo: h.tipoDia,
      inicio: h.inicio,
      fin: h.fin,
    })),
    tieneItinerario: route.itinerario,
  };
}

// 📍 RUTAS DE PARADEROS

// Arrivals básicos
app.get(
  "/v1/stops/:codsimt/arrivals",
  stopArrivalsLimiter,
  async (req, res) => {
    try {
      const { codsimt } = req.params;

      // Validar código de paradero
      const validation = validateStopCode(codsimt);
      if (!validation.valid) {
        return res.status(400).json({
          success: false,
          error: validation.error,
          timestamp: Date.now(),
        });
      }

      console.log(`🚍 Obteniendo arrivals para paradero: ${codsimt}`);

      const data = await getStopArrivals(codsimt);

      const arrivals =
        data.servicios?.item
          ?.filter((item) => item.codigorespuesta === "00")
          .map((item) => ({
            servicio: item.servicio,
            destino: item.destino,
            distanciabus1: item.distanciabus1,
            horaprediccionbus1: item.horaprediccionbus1,
            ppubus1: item.ppubus1,
            distanciabus2: item.distanciabus2,
            horaprediccionbus2: item.horaprediccionbus2,
            ppubus2: item.ppubus2,
          })) || [];

      console.log(`✅ ${arrivals.length} arrivals encontrados para ${codsimt}`);

      res.json({
        success: true,
        data: arrivals,
        timestamp: Date.now(),
      });
    } catch (error) {
      console.error(
        `❌ Error obteniendo arrivals para ${req.params.codsimt}:`,
        error,
      );
      res.status(500).json({
        success: false,
        data: [],
        timestamp: Date.now(),
        error: error.message || "No se pudo obtener arrivals",
      });
    }
  },
);

// Arrivals formateados
app.get(
  "/v1/stops/:codsimt/arrivals/formatted",
  stopArrivalsLimiter,
  async (req, res) => {
    try {
      const { codsimt } = req.params;

      // Validar código de paradero
      const validation = validateStopCode(codsimt);
      if (!validation.valid) {
        return res.status(400).json({
          success: false,
          error: validation.error,
          timestamp: Date.now(),
        });
      }

      console.log(
        `🚍 Obteniendo arrivals formateados para paradero: ${codsimt}`,
      );

      const data = await getStopArrivals(codsimt);

      const arrivals =
        data.servicios?.item
          ?.filter((item) => item.codigorespuesta === "00")
          .map((item) => ({
            servicio: item.servicio,
            destino: item.destino,
            distanciabus1: item.distanciabus1,
            horaprediccionbus1: item.horaprediccionbus1,
            ppubus1: item.ppubus1,
            distanciabus2: item.distanciabus2,
            horaprediccionbus2: item.horaprediccionbus2,
            ppubus2: item.ppubus2,
          })) || [];

      // Formatear respuesta
      const formattedArrivals = formatArrivals(arrivals);

      res.json({
        success: true,
        data: {
          paradero: codsimt,
          totalServicios: formattedArrivals.length,
          arrivals: formattedArrivals,
        },
        timestamp: Date.now(),
      });
    } catch (error) {
      console.error(
        `❌ Error obteniendo arrivals formateados para ${req.params.codsimt}:`,
        error,
      );
      res.status(500).json({
        success: false,
        error: error.message || "Error interno del servidor",
        timestamp: Date.now(),
      });
    }
  },
);

// 🛣️ RUTAS DE SERVICIOS

// Recorrido básico
app.get("/v1/routes/:codser", routeLimiter, async (req, res) => {
  try {
    const { codser } = req.params;

    // Validar código de servicio
    const validation = validateServiceCode(codser);
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        error: validation.error,
        timestamp: Date.now(),
      });
    }

    console.log(`🛣️ Obteniendo recorrido: ${codser}`);

    const data = await getRoute(codser);

    // Priorizar ida, si no existe usar regreso
    const routeData = data.ida || data.regreso;

    if (!routeData) {
      throw new Error("No se encontraron datos de recorrido");
    }

    const route = {
      destino: routeData.destino || "",
      paraderos: routeData.paraderos || [],
      path: routeData.path || [],
      horarios: routeData.horarios || [],
      itinerario: routeData.itinerario || false,
    };

    console.log(
      `✅ Recorrido ${codser} obtenido exitosamente - ${route.paraderos.length} paraderos`,
    );

    res.json({
      success: true,
      data: route,
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error(`❌ Error obteniendo recorrido ${req.params.codser}:`, error);
    res.status(500).json({
      success: false,
      data: {
        destino: "",
        paraderos: [],
        path: [],
        horarios: [],
        itinerario: false,
      },
      timestamp: Date.now(),
      error: error.message || "No se pudo obtener recorrido",
    });
  }
});

// Recorrido formateado
app.get("/v1/routes/:codser/formatted", routeLimiter, async (req, res) => {
  try {
    const { codser } = req.params;

    // Validar código de servicio
    const validation = validateServiceCode(codser);
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        error: validation.error,
        timestamp: Date.now(),
      });
    }

    console.log(`🛣️ Obteniendo recorrido formateado: ${codser}`);

    const data = await getRoute(codser);
    const routeData = data.ida || data.regreso;

    if (!routeData) {
      throw new Error("No se encontraron datos de recorrido");
    }

    const route = {
      destino: routeData.destino || "",
      paraderos: routeData.paraderos || [],
      path: routeData.path || [],
      horarios: routeData.horarios || [],
      itinerario: routeData.itinerario || false,
    };

    const formattedRoute = formatRoute(route);

    res.json({
      success: true,
      data: {
        servicio: codser,
        ...formattedRoute,
      },
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error(
      `❌ Error obteniendo recorrido formateado ${req.params.codser}:`,
      error,
    );
    res.status(500).json({
      success: false,
      error: error.message || "Error interno del servidor",
      timestamp: Date.now(),
    });
  }
});

// Recorrido completo (ida y regreso)
app.get("/v1/routes/:codser/full", routeLimiter, async (req, res) => {
  try {
    const { codser } = req.params;

    // Validar código de servicio
    const validation = validateServiceCode(codser);
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        error: validation.error,
        timestamp: Date.now(),
      });
    }

    console.log(`🔄 Obteniendo recorrido completo: ${codser}`);

    const data = await getRoute(codser);

    const result = {};

    if (data.ida) {
      result.ida = {
        destino: data.ida.destino || "",
        paraderos: data.ida.paraderos || [],
        path: data.ida.path || [],
        horarios: data.ida.horarios || [],
        itinerario: data.ida.itinerario || false,
      };
    }

    if (data.regreso) {
      result.regreso = {
        destino: data.regreso.destino || "",
        paraderos: data.regreso.paraderos || [],
        path: data.regreso.path || [],
        horarios: data.regreso.horarios || [],
        itinerario: data.regreso.itinerario || false,
      };
    }

    console.log(
      `✅ Recorrido completo ${codser} obtenido - Ida: ${!!result.ida}, Regreso: ${!!result.regreso}`,
    );

    res.json({
      success: true,
      data: result,
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error(
      `❌ Error obteniendo recorrido completo ${req.params.codser}:`,
      error,
    );
    res.status(500).json({
      success: false,
      data: {},
      timestamp: Date.now(),
      error: error.message || "No se pudo obtener recorrido completo",
    });
  }
});

// Solo paraderos del recorrido
app.get("/v1/routes/:codser/stops", routeLimiter, async (req, res) => {
  try {
    const { codser } = req.params;

    // Validar código de servicio
    const validation = validateServiceCode(codser);
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        error: validation.error,
        timestamp: Date.now(),
      });
    }

    console.log(`🚏 Obteniendo paraderos del recorrido: ${codser}`);

    const data = await getRoute(codser);
    const routeData = data.ida || data.regreso;

    if (!routeData) {
      throw new Error("No se encontraron datos de recorrido");
    }

    const stops = (routeData.paraderos || []).map((p) => ({
      codigo: p.cod,
      nombre: p.name,
      comuna: p.comuna,
      ubicacion: {
        latitud: p.pos[0],
        longitud: p.pos[1],
      },
    }));

    res.json({
      success: true,
      data: {
        servicio: codser,
        totalParaderos: stops.length,
        paraderos: stops,
      },
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error(
      `❌ Error obteniendo paraderos del recorrido ${req.params.codser}:`,
      error,
    );
    res.status(500).json({
      success: false,
      data: [],
      timestamp: Date.now(),
      error: error.message || "No se pudieron obtener los paraderos",
    });
  }
});

// 🏥 Health check
app.get("/health", (_req, res) => {
  res.json({
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
  });
});

// Backward compatibility
app.get("/api/health", (_req, res) => {
  res.json({ status: "OK", timestamp: new Date().toISOString() });
});

// 📖 Documentación básica
app.get("/", (_req, res) => {
  res.json({
    message: "🚀 LlegaPo API Wrapper para Red.cl",
    version: "1.0.0",
    description:
      "API para consultar tiempos de llegada y recorridos del transporte público de Santiago",
    documentation: {
      health: "GET /health - Estado del servicio",
      arrivals: {
        basic: "GET /v1/stops/:codsimt/arrivals - Tiempos de llegada",
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
      "Arrivals PC205": `/v1/stops/PC205/arrivals`,
      "Recorrido 405": `/v1/routes/405`,
      "Recorrido 405 completo": `/v1/routes/405/full`,
      "Paraderos del 405": `/v1/routes/405/stops`,
    },
    limits: {
      arrivals: "10 requests por minuto",
      routes: "20 requests por 5 minutos",
      general: "100 requests por 15 minutos",
    },
    github: "https://github.com/tu-usuario/llegapo-servidor",
  });
});

// 🚫 404 handler
app.use((_req, res) => {
  res.status(404).json({
    success: false,
    error: "Endpoint no encontrado 😕",
    availableEndpoints: {
      home: "/",
      health: "/health",
      arrivals: "/v1/stops/:codsimt/arrivals",
      routes: "/v1/routes/:codser",
    },
    timestamp: Date.now(),
  });
});

// 💥 Error handler global
app.use((error, _req, res, _next) => {
  console.error("💥 Error no manejado:", error);

  res.status(500).json({
    success: false,
    error: "Error interno del servidor",
    timestamp: Date.now(),
    ...(process.env.NODE_ENV === "development" && {
      details: error.message,
      stack: error.stack,
    }),
  });
});

// 🚀 Start server
app.listen(PORT, () => {
  console.log(`
🚀 LlegaPo corriendo exitosamente!
📍 Host: http://${HOST}:${PORT}
📖 Docs: http://${HOST}:${PORT}/
🏥 Health: http://${HOST}:${PORT}/health

📍 Endpoints disponibles:
   GET /v1/stops/:codsimt/arrivals          - Tiempos de llegada
   GET /v1/stops/:codsimt/arrivals/formatted - Tiempos formateados
   GET /v1/routes/:codser                   - Recorrido básico
   GET /v1/routes/:codser/formatted         - Recorrido formateado
   GET /v1/routes/:codser/full              - Recorrido completo
   GET /v1/routes/:codser/stops             - Solo paraderos

🧪 Ejemplos de uso:
   curl http://${HOST}:${PORT}/v1/stops/PC205/arrivals
   curl http://${HOST}:${PORT}/v1/routes/405
   curl http://${HOST}:${PORT}/health

🔐 Rate limits aplicados:
   - Arrivals: 10 req/min
   - Routes: 20 req/5min
   - General: 100 req/15min

🎯 Consumiendo APIs de Red.cl para Santiago de Chile
  `);
});
