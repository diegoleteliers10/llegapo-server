import { Request, Response } from "express";
import { routeService } from "../services/routeService";
import { ValidationError } from "../types";
import { validateRouteRequest } from "../utils/validators";
import { asyncErrorHandler } from "../middleware/error-handler";

/**
 * Obtiene recorrido básico de un servicio
 */
export const getRoute = asyncErrorHandler(
  async (req: Request, res: Response): Promise<void> => {
    const { codser } = validateRouteRequest(req.params);

    console.log(
      `🛣️ Request recorrido para servicio: ${codser} - IP: ${req.ip}`,
    );

    const result = await routeService.getRoute(codser);

    if (!result.success) {
      res.status(500).json(result);
      return;
    }

    res.json(result);
  },
);

/**
 * Obtiene recorrido formateado de un servicio
 */
export const getRouteFormatted = asyncErrorHandler(
  async (req: Request, res: Response): Promise<void> => {
    const { codser } = validateRouteRequest(req.params);

    console.log(
      `🛣️ Request recorrido formateado para servicio: ${codser} - IP: ${req.ip}`,
    );

    const result = await routeService.getFormattedRoute(codser);

    if (!result.success) {
      res.status(500).json(result);
      return;
    }

    res.json(result);
  },
);

/**
 * Obtiene recorrido completo (ida y regreso) de un servicio
 */
export const getFullRoute = asyncErrorHandler(
  async (req: Request, res: Response): Promise<void> => {
    const { codser } = validateRouteRequest(req.params);

    console.log(
      `🔄 Request recorrido completo para servicio: ${codser} - IP: ${req.ip}`,
    );

    const result = await routeService.getFullRoute(codser);

    if (!result.success) {
      res.status(500).json(result);
      return;
    }

    res.json(result);
  },
);

/**
 * Obtiene solo los paraderos de un recorrido
 */
export const getRouteStops = asyncErrorHandler(
  async (req: Request, res: Response): Promise<void> => {
    const { codser } = validateRouteRequest(req.params);

    console.log(
      `🚏 Request paraderos del recorrido para servicio: ${codser} - IP: ${req.ip}`,
    );

    const result = await routeService.getRouteStops(codser);

    if (!result.success) {
      res.status(500).json(result);
      return;
    }

    res.json(result);
  },
);

/**
 * Busca paraderos específicos dentro de un recorrido
 */
export const searchStopsInRoute = asyncErrorHandler(
  async (req: Request, res: Response): Promise<void> => {
    const { codser } = validateRouteRequest(req.params);
    const searchTerm = req.query.search as string;

    if (!searchTerm || searchTerm.trim().length < 2) {
      res.status(400).json({
        success: false,
        error: "Término de búsqueda debe tener al menos 2 caracteres",
        timestamp: Date.now(),
      });
      return;
    }

    console.log(
      `🔍 Request búsqueda en recorrido ${codser}: "${searchTerm}" - IP: ${req.ip}`,
    );

    const result = await routeService.findStopsInRoute(
      codser,
      searchTerm.trim(),
    );

    res.json({
      success: true,
      data: result.data,
      timestamp: result.timestamp,
    });
  },
);

/**
 * Obtiene horarios detallados de un servicio
 */
export const getRouteSchedules = asyncErrorHandler(
  async (req: Request, res: Response): Promise<void> => {
    const { codser } = validateRouteRequest(req.params);

    console.log(`⏰ Request horarios para servicio: ${codser} - IP: ${req.ip}`);

    const result = await routeService.getRouteSchedules(codser);

    res.json({
      success: true,
      data: result.data,
      timestamp: result.timestamp,
    });
  },
);

/**
 * Middleware para validar parámetros de rutas en todas las rutas
 */
export const validateRouteParams = (
  req: Request,
  res: Response,
  next: Function,
): void => {
  try {
    validateRouteRequest(req.params);
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
 * Handler para obtener información general de un servicio (sin recorrido)
 */
export const getServiceInfo = asyncErrorHandler(
  async (req: Request, res: Response): Promise<void> => {
    const { codser } = validateRouteRequest(req.params);

    console.log(`ℹ️ Request info para servicio: ${codser} - IP: ${req.ip}`);

    res.json({
      success: true,
      data: {
        codigo: codser.toUpperCase(),
        tipo: "servicio_transporte",
        descripcion: "Servicio del sistema de transporte público de Santiago",
        endpoints: {
          route: `/v1/routes/${codser}`,
          formatted: `/v1/routes/${codser}/formatted`,
          full: `/v1/routes/${codser}/full`,
          stops: `/v1/routes/${codser}/stops`,
          search: `/v1/routes/${codser}/search?search=termino`,
          schedules: `/v1/routes/${codser}/schedules`,
        },
      },
      timestamp: Date.now(),
    });
  },
);

/**
 * Handler para comparar dos servicios
 */
export const compareRoutes = asyncErrorHandler(
  async (req: Request, res: Response): Promise<void> => {
    const { codser } = validateRouteRequest(req.params);
    const compareWith = req.query.compare as string;

    if (!compareWith) {
      res.status(400).json({
        success: false,
        error: 'Parámetro "compare" es requerido para comparar servicios',
        timestamp: Date.now(),
      });
      return;
    }

    // Validar el segundo código de servicio
    const { codser: codser2 } = validateRouteRequest({ codser: compareWith });

    console.log(
      `⚖️ Request comparación entre servicios: ${codser} vs ${codser2} - IP: ${req.ip}`,
    );

    // Obtener información de ambos servicios
    const [route1Result, route2Result] = await Promise.allSettled([
      routeService.getFormattedRoute(codser),
      routeService.getFormattedRoute(codser2),
    ]);

    const comparison: any = {
      servicio1: {
        codigo: codser,
        disponible: false,
        error: null,
      },
      servicio2: {
        codigo: codser2,
        disponible: false,
        error: null,
      },
      comparacion: {
        realizada: false,
      },
    };

    // Procesar resultado del primer servicio
    if (route1Result.status === "fulfilled" && route1Result.value.success) {
      comparison.servicio1.disponible = true;
      comparison.servicio1.data = route1Result.value.data;
    } else {
      comparison.servicio1.error =
        route1Result.status === "fulfilled"
          ? route1Result.value.error
          : (route1Result.reason as Error).message;
    }

    // Procesar resultado del segundo servicio
    if (route2Result.status === "fulfilled" && route2Result.value.success) {
      comparison.servicio2.disponible = true;
      comparison.servicio2.data = route2Result.value.data;
    } else {
      comparison.servicio2.error =
        route2Result.status === "fulfilled"
          ? route2Result.value.error
          : (route2Result.reason as Error).message;
    }

    // Solo comparar si ambos servicios están disponibles
    if (comparison.servicio1.disponible && comparison.servicio2.disponible) {
      const data1 = comparison.servicio1.data.route;
      const data2 = comparison.servicio2.data.route;

      comparison.comparacion = {
        realizada: true,
        paraderos: {
          servicio1: data1.totalParaderos,
          servicio2: data2.totalParaderos,
          diferencia: Math.abs(data1.totalParaderos - data2.totalParaderos),
        },
        recorrido: {
          servicio1: data1.recorrido.puntos,
          servicio2: data2.recorrido.puntos,
          diferencia: Math.abs(data1.recorrido.puntos - data2.recorrido.puntos),
        },
        comunas: {
          servicio1:
            comparison.servicio1.data.metadata.comunasRecorridas.length,
          servicio2:
            comparison.servicio2.data.metadata.comunasRecorridas.length,
          comunasComunes:
            comparison.servicio1.data.metadata.comunasRecorridas.filter(
              (c: string) =>
                comparison.servicio2.data.metadata.comunasRecorridas.includes(
                  c,
                ),
            ),
        },
        horarios: {
          servicio1: data1.horarios.length,
          servicio2: data2.horarios.length,
        },
      };
    }

    res.json({
      success: true,
      data: comparison,
      timestamp: Date.now(),
    });
  },
);

/**
 * Handler para endpoints no implementados específicos de rutas
 */
export const notImplementedRouteEndpoint = (
  req: Request,
  res: Response,
): void => {
  res.status(501).json({
    success: false,
    error: "Endpoint no implementado aún",
    suggestion: "Este endpoint está planificado para futuras versiones",
    availableEndpoints: {
      route: `/v1/routes/:codser`,
      formatted: `/v1/routes/:codser/formatted`,
      full: `/v1/routes/:codser/full`,
      stops: `/v1/routes/:codser/stops`,
      search: `/v1/routes/:codser/search?search=termino`,
      schedules: `/v1/routes/:codser/schedules`,
      info: `/v1/routes/:codser/info`,
      compare: `/v1/routes/:codser/compare?compare=otroServicio`,
    },
    timestamp: Date.now(),
  });
};
