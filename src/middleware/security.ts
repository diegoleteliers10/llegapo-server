import rateLimit from "express-rate-limit";
import { Request, Response } from "express";
import { RateLimitConfig } from "../types";

/**
 * Rate limiter para endpoints de arrivals
 */
export const stopArrivalsLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minuto
  max: 5, // max 5 requests por IP
  message: {
    error: "Demasiadas requests para arrivals, espera po 😎",
    retryAfter: 60,
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req: Request, res: Response) => {
    res.status(429).json({
      success: false,
      error: "Demasiadas requests para arrivals, espera po 😎",
      retryAfter: 60,
      timestamp: Date.now(),
      tip: "Los tiempos de llegada se actualizan cada minuto, no necesitas consultar tan seguido",
    });
  },
  skip: (req: Request) => {
    // Permitir más requests en desarrollo
    return process.env.NODE_ENV === "development" && req.ip === "127.0.0.1";
  },
});

/**
 * Rate limiter para endpoints de rutas
 */
export const routeLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutos
  max: 10, // max 10 requests por IP
  message: {
    error: "Demasiadas requests para rutas, espera po 😎",
    retryAfter: 300,
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req: Request, res: Response) => {
    res.status(429).json({
      success: false,
      error: "Demasiadas requests para rutas, espera po 😎",
      retryAfter: 300,
      timestamp: Date.now(),
      tip: "La información de rutas no cambia frecuentemente, puedes cachear estos datos",
    });
  },
  skip: (req: Request) => {
    return process.env.NODE_ENV === "development" && req.ip === "127.0.0.1";
  },
});

/**
 * Rate limiter general para toda la aplicación
 */
export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100, // max 100 requests por IP
  message: {
    error: "Demasiadas requests generales, relájate po 😎",
    retryAfter: 900,
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req: Request, res: Response) => {
    res.status(429).json({
      success: false,
      error: "Demasiadas requests generales, relájate po 😎",
      retryAfter: 900,
      timestamp: Date.now(),
      tip: "Has excedido el límite general de requests. Considera implementar cache del lado del cliente",
    });
  },
  skip: (req: Request) => {
    return process.env.NODE_ENV === "development" && req.ip === "127.0.0.1";
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
