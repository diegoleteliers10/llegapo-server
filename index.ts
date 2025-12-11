import express, { Request, Response, NextFunction } from "express";
import axios from "axios";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import cors from "cors";
import morgan from "morgan";

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || "localhost";

// 🔧 Trust proxy configuración específica para Vercel
if (process.env.NODE_ENV === "production") {
  // En producción (Vercel), confiar solo en el primer proxy
  app.set("trust proxy", 1);
} else {
  // En desarrollo local, no confiar en proxies
  app.set("trust proxy", false);
}

// 🌐 Red.cl API Configuration
const RED_BASE = "https://www.red.cl";
const PREDICTOR_ENDPOINT = "/predictorPlus/prediccion";
const ROUTE_ENDPOINT = "/restservice_v2/rest/conocerecorrido";

// 🔧 JWT Token Cache
let jwtToken = "";
let tokenExpiry = 0;

// Type definitions
interface ValidationResult {
  valid: boolean;
  error?: string;
}

interface RouteData {
  ida?: {
    destino?: string;
    paraderos?: any[];
    path?: any[];
    horarios?: any[];
    itinerario?: boolean;
  };
  regreso?: {
    destino?: string;
    paraderos?: any[];
    path?: any[];
    horarios?: any[];
    itinerario?: boolean;
  };
}

interface StopData {
  cod?: string;
  name?: string;
  comuna?: string;
  y?: number;
  x?: number;
}

// 🔐 Security middleware
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

// 🌍 CORS configuration
app.use(
  cors({
    origin: function (origin, callback) {
      callback(null, true);
    },
    credentials: true,
    optionsSuccessStatus: 200,
  }),
);

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

app.use(
  morgan("combined", {
    skip: function (req, res) {
      return res.statusCode < 400;
    },
  }),
);

// 🚦 Rate limiting
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 1000, // límite de 1000 requests por ventana por IP
  message: {
    error:
      "Demasiadas solicitudes desde esta IP, intenta nuevamente en 15 minutos.",
    retryAfter: 15 * 60, // en segundos
  },
  standardHeaders: true,
  legacyHeaders: false,
  validate: false, // Deshabilitar validaciones para evitar errores de proxy
  handler: (req: Request, res: Response) => {
    res.status(429).json({
      success: false,
      error:
        "Demasiadas solicitudes desde esta IP, intenta nuevamente en 15 minutos.",
      retryAfter: 15 * 60,
      timestamp: Date.now(),
    });
  },
});

// 🚦 Arrivals rate limiting
const stopArrivalsLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minuto
  max: 300, // límite de 300 requests por minuto por IP
  message: {
    error:
      "Demasiadas consultas de llegadas desde esta IP, intenta nuevamente en 1 minuto.",
    retryAfter: 60,
  },
  standardHeaders: true,
  legacyHeaders: false,
  validate: false, // Deshabilitar validaciones para evitar errores de proxy
  handler: (req: Request, res: Response) => {
    res.status(429).json({
      success: false,
      error:
        "Demasiadas consultas de llegadas, intenta nuevamente en 1 minuto.",
      retryAfter: 60,
      timestamp: Date.now(),
    });
  },
});

// 🚦 Routes rate limiting
const routeLimiter = rateLimit({
  windowMs: 2 * 60 * 1000, // 2 minutos
  max: 30, // límite de 30 requests por 2 minutos por IP
  message: {
    error:
      "Demasiadas consultas de recorridos, intenta nuevamente en 2 minutos.",
    retryAfter: 2 * 60,
  },
  standardHeaders: true,
  legacyHeaders: false,
  validate: false, // Deshabilitar validaciones para evitar errores de proxy
  handler: (req: Request, res: Response) => {
    res.status(429).json({
      success: false,
      error:
        "Demasiadas consultas de recorridos, intenta nuevamente en 2 minutos.",
      retryAfter: 2 * 60,
      timestamp: Date.now(),
    });
  },
});

app.use(generalLimiter);

// 🔄 Función para refrescar JWT
async function refreshJwt(): Promise<void> {
  try {
    console.log("🔄 Refrescando JWT token...");

    // En producción: obtener JWT desde header Location de predictorPlus/prediccion (sin t)
    let html: string = "";
    let status: number = 0;
    let contentType: string | undefined;
    let length: number = 0;
    let preview: string = "";
    const start = Date.now();

    if (process.env.NODE_ENV === "production") {
      const predictorUrl = `${RED_BASE}${PREDICTOR_ENDPOINT}`;
      const response = await axios.get(predictorUrl, {
        timeout: 10000,

        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",

          Referer: `${RED_BASE}/planifica-tu-viaje/cuando-llega/`,

          Accept: "*/*",
        },
        // No seguir redirecciones automáticamente para poder leer el Location
        maxRedirects: 0,
        validateStatus: () => true,

        params: {
          codsimt: "PA10",
          codser: "",
        },
      });

      status = response.status;
      const durationMs = Date.now() - start;
      contentType = response.headers?.["content-type"];

      // Intentar extraer t desde Location
      const locationHeader =
        response.headers?.location || response.headers?.Location;
      if (locationHeader && typeof locationHeader === "string") {
        const urlObj = new URL(locationHeader, RED_BASE);
        const tParam = urlObj.searchParams.get("t");
        if (tParam) {
          jwtToken = tParam;
          tokenExpiry = Date.now() + 30 * 60 * 1000; // 30 minutos
          console.log(
            `✅ JWT (prod) extraído de Location en predictorPlus: status=${status} duration=${durationMs}ms t_preview=${jwtToken.slice(0, 10)}...(redacted)`,
          );
          return;
        }
      }

      // Si no hubo Location con t, loguear y fallar
      console.log(
        `⚠️ No se encontró header Location con 't' en predictorPlus (prod). status=${status}`,
      );
      throw new Error("No se pudo extraer el JWT desde Location en producción");
    } else {
      // En desarrollo: obtener JWT desde HTML del Home como antes
      const pageUrl = `${RED_BASE}/Home/`;
      const response = await axios.get(pageUrl, {
        timeout: 10000,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        },
        validateStatus: () => true,
      });
      const durationMs = Date.now() - start;
      html = response.data;
      status = response.status;
      contentType = response.headers?.["content-type"];
      length = typeof html === "string" ? html.length : 0;
      preview = typeof html === "string" ? html.slice(0, 500) : "";
      console.log(
        `📥 Respuesta Red.cl Home - status=${status} duration=${durationMs}ms ct=${contentType} length=${length}`,
      );
      if (status >= 400) {
        console.log(
          `⚠️ Red.cl devolvió status ${status} en Home. Preview:\n${preview}`,
        );
      }
    }

    const durationMs = Date.now() - start;
    const html = response.data;
    const status = response.status;
    const contentType = response.headers?.["content-type"];
    const length = typeof html === "string" ? html.length : 0;
    const preview = typeof html === "string" ? html.slice(0, 500) : "";
    console.log(
      `📥 Respuesta Red.cl Home - status=${status} duration=${durationMs}ms ct=${contentType} length=${length}`,
    );
    if (status >= 400) {
      console.log(
        `⚠️ Red.cl devolvió status ${status} en Home. Preview:\n${preview}`,
      );
    }

    // Extraer JWT del HTML (solo desarrollo)

    const jwtMatch = html.match(/var\s+jwt\s*=\s*["']([^"']+)["']/);

    if (!jwtMatch || !jwtMatch[1]) {
      console.error(
        "❌ No se pudo extraer el JWT de la respuesta Home de Red.cl (dev).",
      );
      console.error("🧪 Preview del HTML (500 chars):\n" + preview);

      console.error(
        "ℹ️ Status:",
        status,
        "Content-Type:",
        contentType,
        "Length:",
        length,
      );

      throw new Error("No se pudo extraer el JWT de la respuesta");
    }

    jwtToken = jwtMatch[1];

    tokenExpiry = Date.now() + 30 * 60 * 1000; // 30 minutos

    console.log("✅ JWT token actualizado exitosamente (dev)");
  } catch (error: any) {
    console.error("❌ Error al refrescar JWT:", error.message);
    throw error;
  }
}

async function getStopArrivals(stopCode: string): Promise<any> {
  try {
    if (!jwtToken || Date.now() > tokenExpiry) {
      await refreshJwt();
    }

    const url = `${RED_BASE}${PREDICTOR_ENDPOINT}`;

    const { data } = await axios.get(url, {
      timeout: 8000,

      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",

        Referer: `${RED_BASE}/planifica-tu-viaje/cuando-llega/`,
      },
      params: { t: jwtToken, codsimt: stopCode, codser: "" },
    });

    return data;
  } catch (error: any) {
    const isAxiosError = !!(error && error.isAxiosError);
    if (isAxiosError) {
      const status = error.response?.status;
      const contentType = error.response?.headers?.["content-type"];
      const data = error.response?.data;
      const dataStr = typeof data === "string" ? data : JSON.stringify(data);
      const preview = dataStr ? String(dataStr).slice(0, 500) : "";
      console.error(
        `❌ Error obteniendo llegadas (Axios) para ${stopCode} - status=${status} ct=${contentType}: ${error.message}`,
      );
      if (preview) {
        console.error("🧪 Body preview (500 chars):\n" + preview);
      }
      const headers = error.response?.headers;
      if (headers) {
        const safeHeaders = Object.fromEntries(
          Object.entries(headers).slice(0, 20),
        );
        console.error("🪪 Response headers (truncated):", safeHeaders);
      }
      console.error("🔗 Request URL:", error.config?.url);
      console.error(
        "🔐 JWT preview:",
        jwtToken ? jwtToken.slice(0, 10) + "...(redacted)" : "none",
      );
    } else {
      console.error(
        `❌ Error obteniendo llegadas para ${stopCode}:`,
        error.message,
      );
    }
    throw error;
  }
}

async function getRoute(serviceCode: string): Promise<RouteData> {
  try {
    const url = `${RED_BASE}${ROUTE_ENDPOINT}`;
    const { data } = await axios.get(url, {
      timeout: 8000,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
      params: { codser: serviceCode },
    });
    return data;
  } catch (error: any) {
    console.error(
      `❌ Error obteniendo recorrido para ${serviceCode}:`,
      error.message,
    );
    throw error;
  }
}

function validateStopCode(stopCode: string): ValidationResult {
  if (!stopCode) {
    return { valid: false, error: "Código de parada requerido" };
  }

  if (typeof stopCode !== "string") {
    return { valid: false, error: "Código de parada debe ser un string" };
  }

  if (stopCode.length < 2 || stopCode.length > 10) {
    return {
      valid: false,
      error: "Código de parada debe tener entre 2 y 10 caracteres",
    };
  }

  const validPattern = /^[A-Z0-9]+$/i;
  if (!validPattern.test(stopCode)) {
    return {
      valid: false,
      error: "Código de parada contiene caracteres inválidos",
    };
  }

  return { valid: true };
}

function validateServiceCode(serviceCode: string): ValidationResult {
  if (!serviceCode) {
    return { valid: false, error: "Código de servicio requerido" };
  }

  if (typeof serviceCode !== "string") {
    return { valid: false, error: "Código de servicio debe ser un string" };
  }

  if (serviceCode.length < 1 || serviceCode.length > 10) {
    return {
      valid: false,
      error: "Código de servicio debe tener entre 1 y 10 caracteres",
    };
  }

  const validPattern = /^[A-Z0-9]+$/i;
  if (!validPattern.test(serviceCode)) {
    return {
      valid: false,
      error: "Código de servicio contiene caracteres inválidos",
    };
  }

  return { valid: true };
}

function formatArrivals(arrivals: any): any {
  return arrivals.map((arrival: any) => ({
    servicio: arrival.servicio || "",
    destino: arrival.destino || "",
    buses: [
      ...(arrival.distanciabus1
        ? [
            {
              distancia: arrival.distanciabus1,
              tiempo: arrival.horaprediccionbus1,
              patente: arrival.ppubus1,
            },
          ]
        : []),
      ...(arrival.distanciabus2
        ? [
            {
              distancia: arrival.distanciabus2,
              tiempo: arrival.horaprediccionbus2,
              patente: arrival.ppubus2,
            },
          ]
        : []),
    ],
  }));
}

function formatRoute(routeData: any): any {
  return {
    destino: routeData.destino || "",
    totalParaderos: routeData.paraderos?.length || 0,
    paraderos: (routeData.paraderos || []).map((p: any) => ({
      codigo: p.cod,
      nombre: p.name,
      comuna: p.comuna,
      ubicacion: {
        latitud: parseFloat(p.y),
        longitud: parseFloat(p.x),
      },
    })),
    recorrido: {
      puntos: routeData.path?.length || 0,
      coordenadas: (routeData.path || []).map((coord: any) => ({
        longitud: parseFloat(coord.lng),
        latitud: parseFloat(coord.lat),
      })),
    },
    horarios: routeData.horarios || [],
    tieneItinerario: routeData.itinerario || false,
  };
}

// 🚌 Endpoint para tiempos de llegada (raw)
app.get(
  "/v1/stops/:codsimt/arrivals",
  stopArrivalsLimiter,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { codsimt } = req.params;

      // Validar código de parada
      const validation = validateStopCode(codsimt);
      if (!validation.valid) {
        res.status(400).json({
          success: false,
          error: validation.error,
          timestamp: Date.now(),
        });
        return;
      }

      console.log(`🚌 Consultando llegadas: ${codsimt}`);

      const data = await getStopArrivals(codsimt);

      // Respuesta raw de Red.cl
      const arrivals = data.map((arrival: any) => ({
        servicio: arrival.servicio,
        destino: arrival.destino,
        distanciabus1: arrival.distanciabus1,
        horaprediccionbus1: arrival.horaprediccionbus1,
        ppubus1: arrival.ppubus1,
        distanciabus2: arrival.distanciabus2,
        horaprediccionbus2: arrival.horaprediccionbus2,
        ppubus2: arrival.ppubus2,
      }));

      console.log(
        `✅ Llegadas obtenidas para ${codsimt}: ${arrivals.length} servicios`,
      );

      res.json({
        success: true,
        data: arrivals,
        timestamp: Date.now(),
      });
    } catch (error: any) {
      console.error(
        `❌ Error obteniendo llegadas para ${req.params.codsimt}:`,
        error.message,
      );
      res.status(500).json({
        success: false,
        data: [],
        timestamp: Date.now(),
        error: error.message,
      });
    }
  },
);

// 🚌 Endpoint para tiempos de llegada (formateado)
app.get(
  "/v1/stops/:codsimt/arrivals/formatted",
  stopArrivalsLimiter,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { codsimt } = req.params;

      // Validar código de parada
      const validation = validateStopCode(codsimt);
      if (!validation.valid) {
        res.status(400).json({
          success: false,
          error: validation.error,
          timestamp: Date.now(),
        });
        return;
      }

      console.log(`🚌 Consultando llegadas formateadas: ${codsimt}`);

      const data = await getStopArrivals(codsimt);

      // Respuesta raw de Red.cl
      const arrivals = data.map((arrival: any) => ({
        servicio: arrival.servicio,
        destino: arrival.destino,
        distanciabus1: arrival.distanciabus1,
        horaprediccionbus1: arrival.horaprediccionbus1,
        ppubus1: arrival.ppubus1,
        distanciabus2: arrival.distanciabus2,
        horaprediccionbus2: arrival.horaprediccionbus2,
        ppubus2: arrival.ppubus2,
      }));

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
    } catch (error: any) {
      console.error(
        `❌ Error obteniendo llegadas formateadas para ${req.params.codsimt}:`,
        error.message,
      );
      res.status(500).json({
        success: false,
        error: error.message,
        timestamp: Date.now(),
      });
    }
  },
);

// 🚌 Endpoint para recorrido (raw)
app.get(
  "/v1/routes/:codser",
  routeLimiter,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { codser } = req.params;

      // Validar código de servicio
      const validation = validateServiceCode(codser);
      if (!validation.valid) {
        res.status(400).json({
          success: false,
          error: validation.error,
          timestamp: Date.now(),
        });
        return;
      }

      console.log(`🚌 Obteniendo recorrido: ${codser}`);

      const data = await getRoute(codser);

      // Tomar el primer recorrido disponible (ida o regreso)
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
        `✅ Recorrido ${codser} obtenido - ${route.paraderos.length} paraderos, ${route.path.length} puntos`,
      );

      res.json({
        success: true,
        data: route,
        timestamp: Date.now(),
      });
    } catch (error: any) {
      console.error(
        `❌ Error obteniendo recorrido ${req.params.codser}:`,
        error.message,
      );
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
        error: error.message,
      });
    }
  },
);

// 🚌 Endpoint para recorrido (formateado)
app.get(
  "/v1/routes/:codser/formatted",
  routeLimiter,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { codser } = req.params;

      // Validar código de servicio
      const validation = validateServiceCode(codser);
      if (!validation.valid) {
        res.status(400).json({
          success: false,
          error: validation.error,
          timestamp: Date.now(),
        });
        return;
      }

      console.log(`🚌 Obteniendo recorrido formateado: ${codser}`);

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
    } catch (error: any) {
      console.error(
        `❌ Error obteniendo recorrido formateado ${req.params.codser}:`,
        error.message,
      );
      res.status(500).json({
        success: false,
        error: error.message,
        timestamp: Date.now(),
      });
    }
  },
);

// Recorrido completo (ida y regreso)
app.get(
  "/v1/routes/:codser/full",
  routeLimiter,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { codser } = req.params;

      // Validar código de servicio
      const validation = validateServiceCode(codser);
      if (!validation.valid) {
        res.status(400).json({
          success: false,
          error: validation.error,
          timestamp: Date.now(),
        });
        return;
      }

      console.log(`🔄 Obteniendo recorrido completo: ${codser}`);

      const data = await getRoute(codser);

      const result: any = {};

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
    } catch (error: any) {
      console.error(
        `❌ Error obteniendo recorrido completo ${req.params.codser}:`,
        error.message,
      );
      res.status(500).json({
        success: false,
        data: {},
        timestamp: Date.now(),
        error: error.message,
      });
    }
  },
);

// Solo paraderos del recorrido
app.get(
  "/v1/routes/:codser/stops",
  routeLimiter,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { codser } = req.params;

      // Validar código de servicio
      const validation = validateServiceCode(codser);
      if (!validation.valid) {
        res.status(400).json({
          success: false,
          error: validation.error,
          timestamp: Date.now(),
        });
        return;
      }

      console.log(`🚏 Obteniendo paraderos del recorrido: ${codser}`);

      const data = await getRoute(codser);
      const routeData = data.ida || data.regreso;

      if (!routeData) {
        throw new Error("No se encontraron datos de recorrido");
      }

      const stops = (routeData.paraderos || []).map((p: StopData) => ({
        codigo: p.cod,
        nombre: p.name,
        comuna: p.comuna,
        ubicacion: {
          latitud: p.y,
          longitud: p.x,
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
    } catch (error: any) {
      console.error(
        `❌ Error obteniendo paraderos ${req.params.codser}:`,
        error.message,
      );
      res.status(500).json({
        success: false,
        data: [],
        timestamp: Date.now(),
        error: error.message,
      });
    }
  },
);

// 📊 Health check
app.get("/health", (_req: Request, res: Response) => {
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
app.get("/api/health", (_req: Request, res: Response) => {
  res.json({ status: "OK", timestamp: new Date().toISOString() });
});

// 📖 Documentación básica
app.get("/", (_req: Request, res: Response) => {
  res.json({
    message: "🚀 LlegaPo API Wrapper para Red.cl",
    version: "1.0.0",
    description:
      "API para consultar tiempos de llegada y recorridos del transporte público de Santiago",
    documentation: {
      health: "GET /health - Estado del servicio",
      arrivals: {
        basic: "GET /v1/stops/:codsimt/arrivals - Tiempos de llegada raw",
        formatted:
          "GET /v1/stops/:codsimt/arrivals/formatted - Tiempos de llegada formateados",
      },
      routes: {
        basic: "GET /v1/routes/:codser - Recorrido básico",
        formatted: "GET /v1/routes/:codser/formatted - Recorrido formateado",
        full: "GET /v1/routes/:codser/full - Recorrido completo (ida y regreso)",
        stops: "GET /v1/routes/:codser/stops - Solo paraderos del recorrido",
      },
    },
    examples: {
      "Arrivals PC205": "/v1/stops/PC205/arrivals",
      "Recorrido 405": "/v1/routes/405",
      "Recorrido 405 completo": "/v1/routes/405/full",
      "Paraderos del 405": "/v1/routes/405/stops",
    },
    limits: {
      arrivals: "60 requests/minuto",
      routes: "30 requests/2 minutos",
      general: "1000 requests/15 minutos",
    },
    github: "https://github.com/tuusuario/llegapo-servidor",
  });
});

// 404 handler
app.use((_req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: "Endpoint no encontrado",
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
app.use((error: any, _req: Request, res: Response, _next: NextFunction) => {
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
const server = app.listen(PORT, () => {
  console.log(`🚀 LlegaPo Servidor corriendo en http://${HOST}:${PORT}`);
});

export default app;
