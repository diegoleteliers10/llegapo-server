import rateLimit from "express-rate-limit";
import { Request, Response } from "express";
import { RateLimitConfig } from "../types";
 
 /**
  * Rate limiter para endpoints de arrivals (stops)
  * Producción: max 15 req/30s por IP
  */
 export const stopArrivalsLimiter = rateLimit({
   windowMs: 30 * 1000, // 30 segundos
   max: 15, // 15 requests por ventana por IP
   standardHeaders: true,
   legacyHeaders: false,
   validate: true,
   keyGenerator: (req: Request) => {
     // Robust IP extraction behind proxies/CDNs
     const h = req.headers;
     const forwarded = (h["x-forwarded-for"] as string) || "";
     const realIp = (h["x-real-ip"] as string) || "";
     const cfIp = (h["cf-connecting-ip"] as string) || "";
     const vercelIp = (h["x-vercel-ip"] as string) || "";
 
     const candidate =
       forwarded.split(",")[0]?.trim() ||
       realIp ||
       cfIp ||
       vercelIp ||
       req.ip ||
       req.socket?.remoteAddress ||
       "global";
 
     return candidate;
   },
   skip: () => process.env.NODE_ENV !== "production", // Solo en producción
   handler: (req: Request, res: Response) => {
     res.status(429).json({
       success: false,
       error: "Demasiadas solicitudes: límite alcanzado para paraderos",
       timestamp: Date.now(),
     });
   },
 });


/**
 * Rate limiter para endpoints de rutas
 */
 export const routeLimiter = rateLimit({
   windowMs: 30 * 1000, // 30 segundos
   max: 20, // 20 requests por ventana por IP
   standardHeaders: true,
   legacyHeaders: false,
   validate: true,
   keyGenerator: (req: Request) => {
     const h = req.headers;
     const forwarded = (h["x-forwarded-for"] as string) || "";
     const realIp = (h["x-real-ip"] as string) || "";
     const cfIp = (h["cf-connecting-ip"] as string) || "";
     const vercelIp = (h["x-vercel-ip"] as string) || "";
 
     const candidate =
       forwarded.split(",")[0]?.trim() ||
       realIp ||
       cfIp ||
       vercelIp ||
       req.ip ||
       req.socket?.remoteAddress ||
       "global";
 
     return candidate;
   },
   skip: () => process.env.NODE_ENV !== "production",
   handler: (req: Request, res: Response) => {
     res.status(429).json({
       success: false,
       error: "Demasiadas solicitudes: límite alcanzado para rutas",
       timestamp: Date.now(),
     });
   },
 });

/**
 * Rate limiter general para toda la aplicación
 */
 export const generalLimiter = rateLimit({
   windowMs: 15 * 60 * 1000, // 15 minutos
   max: 1000, // general alto
   standardHeaders: true,
   legacyHeaders: false,
   validate: true,
   keyGenerator: (req: Request) => {
     const h = req.headers;
     const forwarded = (h["x-forwarded-for"] as string) || "";
     const realIp = (h["x-real-ip"] as string) || "";
     const cfIp = (h["cf-connecting-ip"] as string) || "";
     const vercelIp = (h["x-vercel-ip"] as string) || "";
 
     const candidate =
       forwarded.split(",")[0]?.trim() ||
       realIp ||
       cfIp ||
       vercelIp ||
       req.ip ||
       req.socket?.remoteAddress ||
       "global";
 
     return candidate;
   },
   skip: () => process.env.NODE_ENV !== "production",
   handler: (req: Request, res: Response) => {
     res.status(429).json({
       success: false,
       error: "Demasiadas solicitudes: límite general alcanzado",
       timestamp: Date.now(),
     });
   },
 });

/**
 * Rate limiter más estricto para endpoints críticos
 */
export const strictLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minuto
  max: 2, // max 2 requests por minuto
  message: {
    error: "Endpoint de uso limitado, máximo 2 requests por minuto",
    retryAfter: 60,
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => {
    return req.ip || req.connection?.remoteAddress || "unknown";
  },
  handler: (req: Request, res: Response) => {
    res.status(429).json({
      success: false,
      error: "Endpoint de uso limitado, máximo 2 requests por minuto",
      retryAfter: 60,
      timestamp: Date.now(),
    });
  },
});

/**
 * Middleware para validar User-Agent
 */
export const validateUserAgent = (
  req: Request,
  res: Response,
  next: Function,
): void => {
  const userAgent = req.get("User-Agent");

  if (!userAgent) {
    res.status(400).json({
      success: false,
      error: "User-Agent header es requerido",
      timestamp: Date.now(),
    });
    return;
  }

  // Bloquear User-Agents sospechosos
  const suspiciousPatterns = [
    /bot/i,
    /crawler/i,
    /spider/i,
    /scraper/i,
    /curl/i,
    /wget/i,
  ];

  const isSuspicious = suspiciousPatterns.some((pattern) =>
    pattern.test(userAgent),
  );

  if (isSuspicious && process.env.NODE_ENV === "production") {
    res.status(403).json({
      success: false,
      error: "User-Agent no permitido",
      timestamp: Date.now(),
    });
    return;
  }

  next();
};

/**
 * Middleware para logs de seguridad
 */
export const securityLogger = (
  req: Request,
  res: Response,
  next: Function,
): void => {
  const start = Date.now();

  // Log de request inicial
  console.log(
    `🔐 ${req.method} ${req.path} - IP: ${req.ip} - User-Agent: ${req.get("User-Agent")?.substring(0, 50)}...`,
  );

  // Log cuando la response termine
  res.on("finish", () => {
    const duration = Date.now() - start;
    const status = res.statusCode;

    if (status >= 400) {
      console.log(
        `⚠️ ${req.method} ${req.path} - ${status} - ${duration}ms - IP: ${req.ip}`,
      );
    } else if (duration > 5000) {
      console.log(
        `🐌 ${req.method} ${req.path} - ${status} - ${duration}ms (slow) - IP: ${req.ip}`,
      );
    }
  });

  next();
};

/**
 * Middleware para validar Content-Type en POST requests
 */
export const validateContentType = (
  req: Request,
  res: Response,
  next: Function,
): void => {
  if (req.method === "POST" || req.method === "PUT" || req.method === "PATCH") {
    const contentType = req.get("Content-Type");

    if (!contentType || !contentType.includes("application/json")) {
      res.status(400).json({
        success: false,
        error: "Content-Type debe ser application/json",
        timestamp: Date.now(),
      });
      return;
    }
  }

  next();
};

/**
 * Middleware para prevenir ataques de timing
 */
export const preventTimingAttacks = (
  req: Request,
  res: Response,
  next: Function,
): void => {
  // Agregar un pequeño delay aleatorio para prevenir timing attacks
  const delay = Math.floor(Math.random() * 50) + 10; // 10-60ms

  setTimeout(() => next(), delay);
};

/**
 * Middleware para headers de seguridad adicionales
 */
export const additionalSecurityHeaders = (
  req: Request,
  res: Response,
  next: Function,
): void => {
  // Prevenir clickjacking
  res.setHeader("X-Frame-Options", "DENY");

  // Prevenir MIME type sniffing
  res.setHeader("X-Content-Type-Options", "nosniff");

  // Habilitar XSS protection
  res.setHeader("X-XSS-Protection", "1; mode=block");

  // Referrer policy
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");

  // Permissions policy
  res.setHeader(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()",
  );

  next();
};

/**
 * Configuración personalizable para rate limiting
 */
export function createCustomRateLimit(config: Partial<RateLimitConfig>) {
  const defaultConfig: RateLimitConfig = {
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: {
      error: "Límite de requests excedido",
      retryAfter: 900,
    },
    standardHeaders: true,
    legacyHeaders: false,
  };

  const finalConfig = { ...defaultConfig, ...config };

  return rateLimit({
    ...finalConfig,
    handler: (req: Request, res: Response) => {
      res.status(429).json({
        success: false,
        error: finalConfig.message.error,
        retryAfter: finalConfig.message.retryAfter,
        timestamp: Date.now(),
      });
    },
  });
}

/**
 * Middleware para validar API key (para uso futuro)
 */
export const validateApiKey = (
  req: Request,
  res: Response,
  next: Function,
): void => {
  const apiKey = req.get("X-API-Key");

  // Por ahora solo loggeamos, en el futuro se puede implementar validación real
  if (apiKey) {
    console.log(`🔑 API Key provided: ${apiKey.substring(0, 8)}...`);
  }

  next();
};

/**
 * Middleware para CORS personalizado con opciones avanzadas
 */
export const corsOptions = {
  origin: (origin: string | undefined, callback: Function) => {
    const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(",") || ["*"];

    // Permitir requests sin origin (apps móviles, Postman, etc.)
    if (!origin) return callback(null, true);

    // Permitir todos los orígenes en desarrollo
    if (process.env.NODE_ENV === "development") {
      return callback(null, true);
    }

    // Verificar si el origin está en la lista de permitidos
    if (allowedOrigins.includes("*") || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    // Rechazar el origin
    callback(new Error("No permitido por CORS"));
  },
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "X-API-Key",
    "X-Requested-With",
  ],
  exposedHeaders: [
    "X-RateLimit-Limit",
    "X-RateLimit-Remaining",
    "X-RateLimit-Reset",
  ],
  credentials: true,
  maxAge: 86400, // 24 horas
};
