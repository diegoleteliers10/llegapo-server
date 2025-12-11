import { Request, Response } from "express";
import { stopService } from "../services/stopService";
import { ValidationError } from "../types";
import { validateStopRequest } from "../utils/validators";
import { asyncErrorHandler } from "../middleware/error-handler";

/**
 * Obtiene arrivals básicos de un paradero
 */
export const getStopArrivals = asyncErrorHandler(
  async (req: Request, res: Response): Promise<void> => {
    const { codsimt } = validateStopRequest(req.params);

    console.log(
      `🚍 Request arrivals para paradero: ${codsimt} - IP: ${req.ip}`,
    );

    const result = await stopService.getArrivals(codsimt);

    if (!result.success) {
      res.status(500).json(result);
      return;
    }

    res.json(result);
  },
);

/**
 * Obtiene arrivals formateados de un paradero
 */
export const getStopArrivalsFormatted = asyncErrorHandler(
  async (req: Request, res: Response): Promise<void> => {
    const { codsimt } = validateStopRequest(req.params);

    console.log(
      `🚍 Request arrivals formateados para paradero: ${codsimt} - IP: ${req.ip}`,
    );

    const result = await stopService.getFormattedArrivals(codsimt);

    if (!result.success) {
      res.status(500).json(result);
      return;
    }

    res.json(result);
  },
);

/**
 * Obtiene arrivals de un servicio específico en un paradero
 */
export const getStopArrivalsByService = asyncErrorHandler(
  async (req: Request, res: Response): Promise<void> => {
    const { codsimt } = validateStopRequest(req.params);
    const { busId } = req.query;

    if (!busId || typeof busId !== "string") {
      res.status(400).json({
        success: false,
        error: "Parámetro 'busId' es requerido",
        timestamp: Date.now(),
      });
      return;
    }

    console.log(
      `🚍 Request arrivals para paradero: ${codsimt} - Servicio: ${busId} - IP: ${req.ip}`,
    );

    const result = await stopService.getArrivalsByService(codsimt, busId);

    if (!result.success) {
      res.status(500).json(result);
      return;
    }

    res.json(result);
  },
);

/**
 * Obtiene arrivals con análisis mejorado de un paradero
 */
export const getStopArrivalsEnhanced = asyncErrorHandler(
  async (req: Request, res: Response): Promise<void> => {
    const { codsimt } = validateStopRequest(req.params);

    console.log(
      `🚍 Request arrivals mejorados para paradero: ${codsimt} - IP: ${req.ip}`,
    );

    const result = await stopService.getEnhancedArrivals(codsimt);

    res.json({
      success: true,
      data: result.data,
      timestamp: result.timestamp,
    });
  },
);

/**
 * Obtiene estadísticas de un paradero
 */
export const getStopStatistics = asyncErrorHandler(
  async (req: Request, res: Response): Promise<void> => {
    const { codsimt } = validateStopRequest(req.params);

    // Parámetros opcionales para estadísticas
    const samples = parseInt(req.query.samples as string) || 3;
    const intervalMs = parseInt(req.query.interval as string) || 30000;

    // Validar parámetros
    if (samples < 1 || samples > 10) {
      res.status(400).json({
        success: false,
        error: "El número de muestras debe estar entre 1 y 10",
        timestamp: Date.now(),
      });
      return;
    }

    if (intervalMs < 10000 || intervalMs > 300000) {
      res.status(400).json({
        success: false,
        error: "El intervalo debe estar entre 10 y 300 segundos",
        timestamp: Date.now(),
      });
      return;
    }

    console.log(
      `📊 Request estadísticas para paradero: ${codsimt} (${samples} muestras) - IP: ${req.ip}`,
    );

    const result = await stopService.getStopStatistics(
      codsimt,
      samples,
      intervalMs,
    );

    res.json({
      success: true,
      data: result.data,
      timestamp: result.timestamp,
    });
  },
);

/**
 * Middleware para validar parámetros de paraderos en todas las rutas
 */
export const validateStopParams = (
  req: Request,
  res: Response,
  next: Function,
): void => {
  try {
    validateStopRequest(req.params);
    next();
  } catch (error) {
    if (error instanceof ValidationError) {
      res.status(400).json({
        success: false,
        error: error.message,
        timestamp: Date.now(),
      });
      return;
    }
    next(error);
  }
};

/**
 * Handler para obtener información general de un paradero (sin arrivals)
 */
export const getStopInfo = asyncErrorHandler(
  async (req: Request, res: Response): Promise<void> => {
    const { codsimt } = validateStopRequest(req.params);

    console.log(`ℹ️ Request info para paradero: ${codsimt} - IP: ${req.ip}`);

    // Por ahora solo devolvemos información básica
    // En el futuro se podría integrar con otras APIs para obtener más datos
    res.json({
      success: true,
      data: {
        codigo: codsimt,
        tipo: "paradero",
        descripcion: "Paradero del sistema de transporte público de Santiago",
        endpoints: {
          arrivals: `/v1/stops/${codsimt}/arrivals`,
          arrivalsFormatted: `/v1/stops/${codsimt}/arrivals/formatted`,
          enhanced: `/v1/stops/${codsimt}/enhanced`,
          statistics: `/v1/stops/${codsimt}/statistics`,
        },
      },
      timestamp: Date.now(),
    });
  },
);

/**
 * Handler para endpoints no implementados específicos de paraderos
 */
export const notImplementedStopEndpoint = (
  req: Request,
  res: Response,
): void => {
  res.status(501).json({
    success: false,
    error: "Endpoint no implementado aún",
    suggestion: "Este endpoint está planificado para futuras versiones",
    availableEndpoints: {
      arrivals: `/v1/stops/:codsimt/arrivals`,
      arrivalsFormatted: `/v1/stops/:codsimt/arrivals/formatted`,
      enhanced: `/v1/stops/:codsimt/enhanced`,
      info: `/v1/stops/:codsimt/info`,
      statistics: `/v1/stops/:codsimt/statistics`,
    },
    timestamp: Date.now(),
  });
};
