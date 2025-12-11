import { Request, Response, NextFunction } from 'express';
import { RedClientError, ValidationError } from '../types';

/**
 * Interfaz para errores personalizados
 */
interface CustomError extends Error {
  statusCode?: number;
  status?: number;
  code?: string;
  details?: any;
}

/**
 * Middleware principal de manejo de errores
 */
export const errorHandler = (
  error: CustomError,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  console.error('💥 Error capturado:', {
    message: error.message,
    stack: error.stack,
    url: req.url,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    timestamp: new Date().toISOString()
  });

  // Error de validación
  if (error instanceof ValidationError) {
    res.status(400).json({
      success: false,
      error: error.message,
      type: 'validation_error',
      timestamp: Date.now()
    });
    return;
  }

  // Error del cliente Red.cl
  if (error instanceof RedClientError) {
    res.status(error.statusCode || 500).json({
      success: false,
      error: error.message,
      type: 'red_client_error',
      timestamp: Date.now(),
      ...(process.env.NODE_ENV === 'development' && {
        details: error.details
      })
    });
    return;
  }

  // Error de rate limit (viene de express-rate-limit)
  if (error.message && error.message.includes('Too many requests')) {
    res.status(429).json({
      success: false,
      error: 'Demasiadas requests, espera un momento 😅',
      type: 'rate_limit_error',
      retryAfter: 60,
      timestamp: Date.now()
    });
    return;
  }

  // Error de timeout
  if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
    res.status(504).json({
      success: false,
      error: 'Timeout al conectar con Red.cl - Intenta de nuevo en un momento',
      type: 'timeout_error',
      timestamp: Date.now(),
      tip: 'Red.cl puede estar experimentando lentitud'
    });
    return;
  }

  // Error de conexión
  if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
    res.status(503).json({
      success: false,
      error: 'Servicio de Red.cl no disponible temporalmente',
      type: 'connection_error',
      timestamp: Date.now(),
      tip: 'Intenta de nuevo en unos minutos'
    });
    return;
  }

  // Error de sintaxis JSON
  if (error instanceof SyntaxError && 'body' in error) {
    res.status(400).json({
      success: false,
      error: 'JSON inválido en el request body',
      type: 'json_syntax_error',
      timestamp: Date.now()
    });
    return;
  }

  // Error de parámetros faltantes
  if (error.message.includes('Missing required parameter')) {
    res.status(400).json({
      success: false,
      error: 'Parámetros requeridos faltantes',
      type: 'missing_parameters',
      timestamp: Date.now()
    });
    return;
  }

  // Errores HTTP específicos
  const statusCode = error.statusCode || error.status || 500;

  if (statusCode === 404) {
    res.status(404).json({
      success: false,
      error: 'Recurso no encontrado',
      type: 'not_found',
      timestamp: Date.now()
    });
    return;
  }

  if (statusCode === 401) {
    res.status(401).json({
      success: false,
      error: 'No autorizado',
      type: 'unauthorized',
      timestamp: Date.now()
    });
    return;
  }

  if (statusCode === 403) {
    res.status(403).json({
      success: false,
      error: 'Acceso prohibido',
      type: 'forbidden',
      timestamp: Date.now()
    });
    return;
  }

  // Error interno del servidor (fallback)
  res.status(500).json({
    success: false,
    error: 'Error interno del servidor',
    type: 'internal_server_error',
    timestamp: Date.now(),
    ...(process.env.NODE_ENV === 'development' && {
      details: {
        message: error.message,
        stack: error.stack
      }
    })
  });
};

/**
 * Middleware para capturar errores async/await
 */
export const asyncErrorHandler = (fn: Function) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/**
 * Middleware para manejar rutas no encontradas (404)
 */
export const notFoundHandler = (req: Request, res: Response): void => {
  res.status(404).json({
    success: false,
    error: `Endpoint no encontrado: ${req.method} ${req.path} 😕`,
    type: 'not_found',
    availableEndpoints: {
      home: '/',
      health: '/health',
      arrivals: '/v1/stops/:codsimt/arrivals',
      arrivalsFormatted: '/v1/stops/:codsimt/arrivals/formatted',
      routes: '/v1/routes/:codser',
      routesFormatted: '/v1/routes/:codser/formatted',
      fullRoute: '/v1/routes/:codser/full',
      routeStops: '/v1/routes/:codser/stops'
    },
    timestamp: Date.now(),
    tip: 'Revisa la documentación en la ruta raíz (/)'
  });
};

/**
 * Middleware para logging de errores específicos
 */
export const errorLogger = (
  error: CustomError,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // Log diferentes tipos de errores con diferentes niveles
  if (error instanceof ValidationError) {
    console.warn(`⚠️ Validation Error: ${error.message} - ${req.method} ${req.path} - IP: ${req.ip}`);
  } else if (error instanceof RedClientError) {
    console.error(`🔴 Red Client Error: ${error.message} - ${req.method} ${req.path} - IP: ${req.ip}`);
  } else if (error.statusCode && error.statusCode >= 500) {
    console.error(`💥 Server Error ${error.statusCode}: ${error.message} - ${req.method} ${req.path} - IP: ${req.ip}`);
  } else {
    console.log(`📝 Error ${error.statusCode || 'Unknown'}: ${error.message} - ${req.method} ${req.path} - IP: ${req.ip}`);
  }

  next(error);
};

/**
 * Función helper para crear errores HTTP personalizados
 */
export function createHttpError(statusCode: number, message: string, details?: any): CustomError {
  const error = new Error(message) as CustomError;
  error.statusCode = statusCode;
  error.details = details;
  return error;
}

/**
 * Middleware para validar que la respuesta no esté corrupta
 */
export const validateResponse = (req: Request, res: Response, next: NextFunction): void => {
  const originalSend = res.send;

  res.send = function(data: any) {
    try {
      // Si es un string, verificar que sea JSON válido
      if (typeof data === 'string') {
        JSON.parse(data);
      }

      return originalSend.call(this, data);
    } catch (error) {
      console.error('💥 Response validation error:', error);

      return originalSend.call(this, JSON.stringify({
        success: false,
        error: 'Error interno al procesar respuesta',
        timestamp: Date.now()
      }));
    }
  };

  next();
};

/**
 * Middleware para timeout de requests
 */
export const requestTimeout = (timeoutMs: number = 30000) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const timeout = setTimeout(() => {
      if (!res.headersSent) {
        res.status(408).json({
          success: false,
          error: 'Request timeout - La operación tardó demasiado',
          type: 'request_timeout',
          timestamp: Date.now(),
          tip: 'Intenta de nuevo o simplifica tu consulta'
        });
      }
    }, timeoutMs);

    // Limpiar timeout cuando la respuesta termine
    res.on('finish', () => {
      clearTimeout(timeout);
    });

    res.on('close', () => {
      clearTimeout(timeout);
    });

    next();
  };
};

/**
 * Helper para manejar promises que pueden fallar
 */
export async function safeAsync<T>(
  promise: Promise<T>,
  fallbackValue?: T
): Promise<[T | null, Error | null]> {
  try {
    const result = await promise;
    return [result, null];
  } catch (error) {
    console.error('🔄 Safe async error:', error);
    return [fallbackValue || null, error as Error];
  }
}
