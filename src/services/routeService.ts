import { redClient } from "../utils/red-client";
import {
  ApiResponse,
  RedRoute,
  FormattedRoute,
  ValidationError,
} from "../types";
import {
  formatRoute,
  formatRouteStops,
  formatSchedule,
} from "../utils/formatters";
import { validateAndCleanServiceCode } from "../utils/validators";

export class RouteService {
  /**
   * Obtiene el recorrido básico de un servicio (ida o regreso)
   */
  async getRoute(codser: string): Promise<ApiResponse<RedRoute>> {
    try {
      console.log(`🛣️ Obteniendo recorrido: ${codser}`);

      // Validar y limpiar código de servicio
      const cleanCode = validateAndCleanServiceCode(codser);

      // Obtener datos de Red.cl
      const data = await redClient.getRoute(cleanCode);

      // Priorizar ida, si no existe usar regreso
      const routeData = data.ida || data.regreso;

      if (!routeData) {
        throw new Error("No se encontraron datos de recorrido");
      }

      const route: RedRoute = {
        destino: routeData.destino || "",
        paraderos: routeData.paraderos || [],
        path: routeData.path || [],
        horarios: routeData.horarios || [],
        itinerario: routeData.itinerario || false,
      };

      console.log(
        `✅ Recorrido ${cleanCode} obtenido exitosamente - ${route.paraderos.length} paraderos`,
      );

      return {
        success: true,
        data: route,
        timestamp: Date.now(),
      };
    } catch (error: any) {
      console.error(`❌ Error obteniendo recorrido ${codser}:`, error);

      // Log detallado del error para producción
      if (error.response) {
        console.error(`📡 Status Code: ${error.response.status}`);
        console.error(`📦 Response Data:`, error.response.data);
        console.error(`🔧 Response Headers:`, error.response.headers);
      } else if (error.request) {
        console.error(`📡 Request sent but no response:`, error.request);
      } else {
        console.error(`⚙️ Error Message:`, error.message);
      }

      if (error instanceof ValidationError) {
        throw error;
      }

      return {
        success: false,
        data: {
          destino: "",
          paraderos: [],
          path: [],
          horarios: [],
          itinerario: false,
        },
        timestamp: Date.now(),
        error:
          error instanceof Error
            ? error.message
            : "No se pudo obtener recorrido",
      };
    }
  }

  /**
   * Obtiene el recorrido formateado para mejor legibilidad
   */
  async getFormattedRoute(codser: string): Promise<
    ApiResponse<{
      servicio: string;
      route: FormattedRoute;
      metadata: {
        tieneIda: boolean;
        tieneRegreso: boolean;
        totalKilometros?: number;
        comunasRecorridas: string[];
      };
    }>
  > {
    try {
      console.log(`🛣️ Obteniendo recorrido formateado: ${codser}`);

      const routeResult = await this.getRoute(codser);

      if (!routeResult.success) {
        return {
          success: false,
          data: {
            servicio: codser,
            route: {
              destino: "",
              totalParaderos: 0,
              paraderos: [],
              recorrido: { puntos: 0, coordenadas: [] },
              horarios: [],
              tieneItinerario: false,
            },
            metadata: {
              tieneIda: false,
              tieneRegreso: false,
              comunasRecorridas: [],
            },
          },
          timestamp: Date.now(),
          error: routeResult.error,
        };
      }

      // Obtener información completa para metadata
      const fullData = await redClient.getRoute(codser);

      const formattedRoute = formatRoute(routeResult.data);
      const comunasRecorridas = [
        ...new Set(routeResult.data.paraderos.map((p) => p.comuna)),
      ];

      // Calcular distancia aproximada si hay path
      let totalKilometros: number | undefined;
      if (routeResult.data.path.length > 1) {
        totalKilometros = this.calculateRouteDistance(routeResult.data.path);
      }

      return {
        success: true,
        data: {
          servicio: codser.toUpperCase(),
          route: formattedRoute,
          metadata: {
            tieneIda: Boolean(fullData.ida),
            tieneRegreso: Boolean(fullData.regreso),
            totalKilometros,
            comunasRecorridas,
          },
        },
        timestamp: routeResult.timestamp,
      };
    } catch (error) {
      console.error(
        `❌ Error obteniendo recorrido formateado ${codser}:`,
        error,
      );

      if (error instanceof ValidationError) {
        throw error;
      }

      throw new Error(
        error instanceof Error
          ? error.message
          : "No se pudo obtener recorrido formateado",
      );
    }
  }

  /**
   * Obtiene tanto ida como regreso del recorrido
   */
  async getFullRoute(codser: string): Promise<
    ApiResponse<{
      servicio: string;
      ida?: RedRoute;
      regreso?: RedRoute;
      resumen: {
        tieneIda: boolean;
        tieneRegreso: boolean;
        totalParaderosIda: number;
        totalParaderosRegreso: number;
        comunasUnicas: string[];
        horarios: {
          ida: Array<{
            dia: string;
            horario: string;
            inicio: string;
            fin: string;
          }>;
          regreso: Array<{
            dia: string;
            horario: string;
            inicio: string;
            fin: string;
          }>;
        };
      };
    }>
  > {
    try {
      console.log(`🔄 Obteniendo recorrido completo: ${codser}`);

      const cleanCode = validateAndCleanServiceCode(codser);
      const data = await redClient.getRoute(cleanCode);

      const result: { ida?: RedRoute; regreso?: RedRoute } = {};
      const comunasSet = new Set<string>();

      if (data.ida) {
        result.ida = {
          destino: data.ida.destino || "",
          paraderos: data.ida.paraderos || [],
          path: data.ida.path || [],
          horarios: data.ida.horarios || [],
          itinerario: data.ida.itinerario || false,
        };
        result.ida.paraderos.forEach((p) => comunasSet.add(p.comuna));
      }

      if (data.regreso) {
        result.regreso = {
          destino: data.regreso.destino || "",
          paraderos: data.regreso.paraderos || [],
          path: data.regreso.path || [],
          horarios: data.regreso.horarios || [],
          itinerario: data.regreso.itinerario || false,
        };
        result.regreso.paraderos.forEach((p) => comunasSet.add(p.comuna));
      }

      const comunasUnicas = Array.from(comunasSet);

      console.log(
        `✅ Recorrido completo ${cleanCode} obtenido - Ida: ${!!result.ida}, Regreso: ${!!result.regreso}`,
      );

      return {
        success: true,
        data: {
          servicio: cleanCode,
          ida: result.ida,
          regreso: result.regreso,
          resumen: {
            tieneIda: Boolean(result.ida),
            tieneRegreso: Boolean(result.regreso),
            totalParaderosIda: result.ida?.paraderos.length || 0,
            totalParaderosRegreso: result.regreso?.paraderos.length || 0,
            comunasUnicas,
            horarios: {
              ida: result.ida ? formatSchedule(result.ida.horarios) : [],
              regreso: result.regreso
                ? formatSchedule(result.regreso.horarios)
                : [],
            },
          },
        },
        timestamp: Date.now(),
      };
    } catch (error) {
      console.error(`❌ Error obteniendo recorrido completo ${codser}:`, error);

      if (error instanceof ValidationError) {
        throw error;
      }

      return {
        success: false,
        data: {
          servicio: codser,
          resumen: {
            tieneIda: false,
            tieneRegreso: false,
            totalParaderosIda: 0,
            totalParaderosRegreso: 0,
            comunasUnicas: [],
            horarios: { ida: [], regreso: [] },
          },
        },
        timestamp: Date.now(),
        error:
          error instanceof Error
            ? error.message
            : "No se pudo obtener recorrido completo",
      };
    }
  }

  /**
   * Obtiene solo los paraderos de un recorrido
   */
  async getRouteStops(codser: string): Promise<
    ApiResponse<{
      servicio: string;
      totalParaderos: number;
      paraderos: Array<{
        codigo: string;
        nombre: string;
        comuna: string;
        ubicacion: { latitud: number; longitud: number };
      }>;
      comunas: Array<{
        nombre: string;
        totalParaderos: number;
        paraderos: string[];
      }>;
    }>
  > {
    try {
      console.log(`🚏 Obteniendo paraderos del recorrido: ${codser}`);

      const routeResult = await this.getRoute(codser);

      if (!routeResult.success) {
        return {
          success: false,
          data: {
            servicio: codser,
            totalParaderos: 0,
            paraderos: [],
            comunas: [],
          },
          timestamp: Date.now(),
          error: routeResult.error,
        };
      }

      const stops = formatRouteStops(routeResult.data);

      // Agrupar por comunas
      const comunasMap = new Map<string, string[]>();
      stops.forEach((stop) => {
        if (!comunasMap.has(stop.comuna)) {
          comunasMap.set(stop.comuna, []);
        }
        comunasMap.get(stop.comuna)!.push(stop.codigo);
      });

      const comunas = Array.from(comunasMap.entries()).map(
        ([nombre, paraderos]) => ({
          nombre,
          totalParaderos: paraderos.length,
          paraderos,
        }),
      );

      return {
        success: true,
        data: {
          servicio: codser.toUpperCase(),
          totalParaderos: stops.length,
          paraderos: stops,
          comunas,
        },
        timestamp: routeResult.timestamp,
      };
    } catch (error) {
      console.error(
        `❌ Error obteniendo paraderos del recorrido ${codser}:`,
        error,
      );

      if (error instanceof ValidationError) {
        throw error;
      }

      return {
        success: false,
        data: {
          servicio: codser,
          totalParaderos: 0,
          paraderos: [],
          comunas: [],
        },
        timestamp: Date.now(),
        error:
          error instanceof Error
            ? error.message
            : "No se pudieron obtener los paraderos",
      };
    }
  }

  /**
   * Busca paraderos específicos dentro de un recorrido
   */
  async findStopsInRoute(
    codser: string,
    searchTerm: string,
  ): Promise<
    ApiResponse<{
      servicio: string;
      terminoBusqueda: string;
      paraderos: Array<{
        codigo: string;
        nombre: string;
        comuna: string;
        ubicacion: { latitud: number; longitud: number };
        indice: number;
      }>;
      totalEncontrados: number;
    }>
  > {
    try {
      const stopsResult = await this.getRouteStops(codser);

      if (!stopsResult.success) {
        throw new Error(
          stopsResult.error || "No se pudieron obtener paraderos",
        );
      }

      const searchLower = searchTerm.toLowerCase();
      const foundStops = stopsResult.data.paraderos
        .map((stop, index) => ({ ...stop, indice: index }))
        .filter(
          (stop) =>
            stop.codigo.toLowerCase().includes(searchLower) ||
            stop.nombre.toLowerCase().includes(searchLower) ||
            stop.comuna.toLowerCase().includes(searchLower),
        );

      return {
        success: true,
        data: {
          servicio: codser.toUpperCase(),
          terminoBusqueda: searchTerm,
          paraderos: foundStops,
          totalEncontrados: foundStops.length,
        },
        timestamp: Date.now(),
      };
    } catch (error) {
      console.error(
        `❌ Error buscando paraderos en recorrido ${codser}:`,
        error,
      );

      if (error instanceof ValidationError) {
        throw error;
      }

      throw new Error(
        error instanceof Error
          ? error.message
          : "No se pudo realizar la búsqueda",
      );
    }
  }

  /**
   * Obtiene información detallada de horarios de un servicio
   */
  async getRouteSchedules(codser: string): Promise<
    ApiResponse<{
      servicio: string;
      horarios: {
        ida: Array<{
          dia: string;
          horario: string;
          inicio: string;
          fin: string;
          duracionHoras: number;
        }>;
        regreso: Array<{
          dia: string;
          horario: string;
          inicio: string;
          fin: string;
          duracionHoras: number;
        }>;
      };
      resumen: {
        operaLunesViernes: boolean;
        operaSabados: boolean;
        operaDomingos: boolean;
        horarioMasAmplio: string;
        totalHorasOperacion: number;
      };
    }>
  > {
    try {
      const fullRouteResult = await this.getFullRoute(codser);

      if (!fullRouteResult.success) {
        throw new Error(
          fullRouteResult.error || "No se pudieron obtener horarios",
        );
      }

      const data = fullRouteResult.data;

      const processSchedules = (
        horarios: Array<{
          dia: string;
          horario: string;
          inicio: string;
          fin: string;
        }>,
      ) => {
        return horarios.map((h) => ({
          ...h,
          duracionHoras: this.calculateDurationHours(h.inicio, h.fin),
        }));
      };

      const horariosIda = processSchedules(data.resumen.horarios.ida);
      const horariosRegreso = processSchedules(data.resumen.horarios.regreso);

      // Análisis de horarios
      const todosTipos = [...horariosIda, ...horariosRegreso].map((h) => h.dia);
      const operaLunesViernes = todosTipos.some(
        (t) => t.includes("Lunes") || t.includes("Viernes"),
      );
      const operaSabados = todosTipos.some((t) => t.includes("Sábado"));
      const operaDomingos = todosTipos.some((t) => t.includes("Domingo"));

      const todasDuraciones = [...horariosIda, ...horariosRegreso].map(
        (h) => h.duracionHoras,
      );
      const totalHorasOperacion = Math.max(...todasDuraciones, 0);

      const horarioMasAmplio = [...horariosIda, ...horariosRegreso].reduce(
        (prev, current) =>
          current.duracionHoras > prev.duracionHoras ? current : prev,
        { dia: "", horario: "", duracionHoras: 0 },
      ).horario;

      return {
        success: true,
        data: {
          servicio: codser.toUpperCase(),
          horarios: {
            ida: horariosIda,
            regreso: horariosRegreso,
          },
          resumen: {
            operaLunesViernes,
            operaSabados,
            operaDomingos,
            horarioMasAmplio,
            totalHorasOperacion,
          },
        },
        timestamp: Date.now(),
      };
    } catch (error) {
      console.error(
        `❌ Error obteniendo horarios del servicio ${codser}:`,
        error,
      );

      if (error instanceof ValidationError) {
        throw error;
      }

      throw new Error(
        error instanceof Error
          ? error.message
          : "No se pudieron obtener horarios",
      );
    }
  }

  /**
   * Calcula la distancia aproximada de un recorrido usando coordenadas
   */
  private calculateRouteDistance(path: Array<[number, number]>): number {
    if (path.length < 2) return 0;

    let totalDistance = 0;
    for (let i = 0; i < path.length - 1; i++) {
      const [lon1, lat1] = path[i];
      const [lon2, lat2] = path[i + 1];
      totalDistance += this.haversineDistance(lat1, lon1, lat2, lon2);
    }

    return Math.round(totalDistance * 100) / 100; // Redondear a 2 decimales
  }

  /**
   * Calcula la distancia entre dos puntos usando la fórmula de Haversine
   */
  private haversineDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
  ): number {
    const R = 6371; // Radio de la Tierra en km
    const dLat = this.deg2rad(lat2 - lat1);
    const dLon = this.deg2rad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.deg2rad(lat1)) *
        Math.cos(this.deg2rad(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const d = R * c;
    return d;
  }

  /**
   * Convierte grados a radianes
   */
  private deg2rad(deg: number): number {
    return deg * (Math.PI / 180);
  }

  /**
   * Calcula la duración en horas entre dos horarios
   */
  private calculateDurationHours(inicio: string, fin: string): number {
    try {
      const [inicioHour, inicioMin] = inicio.split(":").map(Number);
      const [finHour, finMin] = fin.split(":").map(Number);

      const inicioMinutos = inicioHour * 60 + inicioMin;
      const finMinutos = finHour * 60 + finMin;

      const duracionMinutos = finMinutos - inicioMinutos;
      return Math.round((duracionMinutos / 60) * 100) / 100;
    } catch {
      return 0;
    }
  }
}

// Instancia singleton del servicio
export const routeService = new RouteService();
