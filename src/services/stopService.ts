import { redClient } from "../utils/red-client";
import {
  ApiResponse,
  RedStopArrival,
  FormattedArrival,
  ValidationError,
} from "../types";
import {
  formatArrivals,
  formatArrivalTime,
  generateArrivalsSummary,
} from "../utils/formatters";
import { validateAndCleanStopCode } from "../utils/validators";

export class StopService {
  /**
   * Obtiene los arrivals básicos de un paradero
   */
  async getArrivals(codsimt: string): Promise<ApiResponse<RedStopArrival[]>> {
    try {
      console.log(`🚍 Obteniendo arrivals para paradero: ${codsimt}`);

      // Validar y limpiar código de paradero
      const cleanCode = validateAndCleanStopCode(codsimt);

      // Obtener datos de Red.cl
      const data = await redClient.getStopArrivals(cleanCode);

      // Procesar respuesta
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

      console.log(
        `✅ ${arrivals.length} arrivals encontrados para ${cleanCode}`,
      );

      return {
        success: true,
        data: arrivals,
        timestamp: Date.now(),
      };
    } catch (error) {
      console.error(`❌ Error obteniendo arrivals para ${codsimt}:`, error);

      if (error instanceof ValidationError) {
        throw error;
      }

      return {
        success: false,
        data: [],
        timestamp: Date.now(),
        error:
          error instanceof Error
            ? error.message
            : "No se pudo obtener arrivals",
      };
    }
  }

  /**
   * Obtiene arrivals formateados para mejor legibilidad
   */
  async getFormattedArrivals(codsimt: string): Promise<
    ApiResponse<{
      paradero: string;
      totalServicios: number;
      arrivals: FormattedArrival[];
      resumen: string;
    }>
  > {
    try {
      console.log(
        `🚍 Obteniendo arrivals formateados para paradero: ${codsimt}`,
      );

      const arrivalsResult = await this.getArrivals(codsimt);

      if (!arrivalsResult.success) {
        return {
          success: false,
          data: {
            paradero: codsimt,
            totalServicios: 0,
            arrivals: [],
            resumen: "No se pudieron obtener arrivals",
          },
          timestamp: Date.now(),
          error: arrivalsResult.error,
        };
      }

      const formattedArrivals = formatArrivals(arrivalsResult.data);
      const resumen = generateArrivalsSummary(arrivalsResult.data);

      return {
        success: true,
        data: {
          paradero: codsimt.toUpperCase(),
          totalServicios: formattedArrivals.length,
          arrivals: formattedArrivals,
          resumen,
        },
        timestamp: arrivalsResult.timestamp,
      };
    } catch (error) {
      console.error(
        `❌ Error obteniendo arrivals formateados para ${codsimt}:`,
        error,
      );

      if (error instanceof ValidationError) {
        throw error;
      }

      return {
        success: false,
        data: {
          paradero: codsimt,
          totalServicios: 0,
          arrivals: [],
          resumen: "Error interno del servidor",
        },
        timestamp: Date.now(),
        error:
          error instanceof Error ? error.message : "Error interno del servidor",
      };
    }
  }

  /**
   * Obtiene arrivals de un servicio específico en un paradero
   */
  async getArrivalsByService(
    codsimt: string,
    serviceCode: string,
  ): Promise<
    ApiResponse<{
      paradero: string;
      servicio: string;
      arrivals: RedStopArrival[];
      totalBuses: number;
      buses: Array<{
        numero: number;
        distancia: string;
        tiempoLlegada: string;
        ppu: string;
      }>;
    }>
  > {
    try {
      console.log(
        `🚍 Obteniendo arrivals para paradero: ${codsimt} - Servicio: ${serviceCode}`,
      );

      // Obtener todos los arrivals del paradero
      const arrivalsResult = await this.getArrivals(codsimt);

      if (!arrivalsResult.success) {
        return {
          success: false,
          data: {
            paradero: codsimt,
            servicio: serviceCode,
            arrivals: [],
            totalBuses: 0,
            buses: [],
          },
          timestamp: Date.now(),
          error: arrivalsResult.error,
        };
      }

      // Filtrar por código de servicio (insensitive a mayúsculas/minúsculas)
      const serviceArrivals = arrivalsResult.data.filter(
        (arrival) =>
          arrival.servicio.toLowerCase() === serviceCode.toLowerCase(),
      );

      if (serviceArrivals.length === 0) {
        return {
          success: false,
          data: {
            paradero: codsimt,
            servicio: serviceCode,
            arrivals: [],
            totalBuses: 0,
            buses: [],
          },
          timestamp: Date.now(),
          error: `Servicio ${serviceCode} no encontrado en paradero ${codsimt}`,
        };
      }

      // Procesar información de buses
      const buses: Array<{
        numero: number;
        distancia: string;
        tiempoLlegada: string;
        ppu: string;
      }> = [];

      serviceArrivals.forEach((arrival) => {
        // Bus 1
        if (arrival.horaprediccionbus1 && arrival.distanciabus1) {
          buses.push({
            numero: 1,
            distancia: arrival.distanciabus1,
            tiempoLlegada: arrival.horaprediccionbus1,
            ppu: arrival.ppubus1 || "N/A",
          });
        }

        // Bus 2
        if (arrival.horaprediccionbus2 && arrival.distanciabus2) {
          buses.push({
            numero: 2,
            distancia: arrival.distanciabus2,
            tiempoLlegada: arrival.horaprediccionbus2,
            ppu: arrival.ppubus2 || "N/A",
          });
        }
      });

      console.log(
        `✅ Servicio ${serviceCode} encontrado en ${codsimt} - ${buses.length} buses`,
      );

      return {
        success: true,
        data: {
          paradero: codsimt.toUpperCase(),
          servicio: serviceCode.toUpperCase(),
          arrivals: serviceArrivals,
          totalBuses: buses.length,
          buses: buses.sort((a, b) => {
            // Ordenar por tiempo de llegada más cercano
            const timeA = a.tiempoLlegada.includes(":")
              ? parseInt(a.tiempoLlegada.split(":")[1])
              : parseInt(a.tiempoLlegada);
            const timeB = b.tiempoLlegada.includes(":")
              ? parseInt(b.tiempoLlegada.split(":")[1])
              : parseInt(b.tiempoLlegada);
            return timeA - timeB;
          }),
        },
        timestamp: Date.now(),
      };
    } catch (error) {
      console.error(
        `❌ Error obteniendo arrivals del servicio ${serviceCode} para ${codsimt}:`,
        error,
      );

      if (error instanceof ValidationError) {
        throw error;
      }

      return {
        success: false,
        data: {
          paradero: codsimt,
          servicio: serviceCode,
          arrivals: [],
          totalBuses: 0,
          buses: [],
        },
        timestamp: Date.now(),
        error:
          error instanceof Error ? error.message : "Error interno del servidor",
      };
    }
  }

  /**
   * Obtiene arrivals con información adicional y análisis
   */
  async getEnhancedArrivals(codsimt: string): Promise<
    ApiResponse<{
      paradero: string;
      totalServicios: number;
      arrivals: FormattedArrival[];
      analisis: {
        busesLlegando: number;
        busesProximos: number;
        servicioMasRapido: string | null;
        tiempoPromedioEspera: string;
      };
      resumen: string;
    }>
  > {
    try {
      const arrivalsResult = await this.getArrivals(codsimt);

      if (!arrivalsResult.success) {
        throw new Error(
          arrivalsResult.error || "No se pudieron obtener arrivals",
        );
      }

      const arrivals = arrivalsResult.data;
      const serviciosUnicos = [...new Set(arrivals.map((a) => a.servicio))];

      // Procesar y analizar arrivals
      const formattedArrivals = formatArrivals(arrivals);

      // Análisis de buses
      let busesLlegando = 0;
      let busesProximos = 0;
      let servicioMasRapido: string | null = null;
      let tiempoMasRapido = Infinity;

      arrivals.forEach((arrival) => {
        // Contar buses llegando (<= 2 minutos) y próximos (2-10 minutos)
        const tiempo1 = arrival.horaprediccionbus1;
        const tiempo2 = arrival.horaprediccionbus2;

        [tiempo1, tiempo2].forEach((tiempo) => {
          if (tiempo) {
            const minutos = this.extractMinutesFromTime(tiempo);
            if (minutos <= 2) {
              busesLlegando++;
              if (minutos < tiempoMasRapido) {
                tiempoMasRapido = minutos;
                servicioMasRapido = arrival.servicio;
              }
            } else if (minutos <= 10) {
              busesProximos++;
            }
          }
        });
      });

      // Calcular tiempo promedio de espera
      const tiempos = arrivals.flatMap((arrival) =>
        [arrival.horaprediccionbus1, arrival.horaprediccionbus2]
          .filter(Boolean)
          .map((tiempo) => this.extractMinutesFromTime(tiempo!)),
      );

      const promedioMinutos =
        tiempos.length > 0
          ? Math.round(tiempos.reduce((a, b) => a + b, 0) / tiempos.length)
          : 0;

      const resumen = generateArrivalsSummary(arrivals);

      return {
        success: true,
        data: {
          paradero: codsimt.toUpperCase(),
          totalServicios: serviciosUnicos.length,
          arrivals: formattedArrivals,
          analisis: {
            busesLlegando,
            busesProximos,
            servicioMasRapido,
            tiempoPromedioEspera: `${promedioMinutos} minutos`,
          },
          resumen,
        },
        timestamp: arrivalsResult.timestamp,
      };
    } catch (error) {
      console.error(`❌ Error en enhanced arrivals para ${codsimt}:`, error);

      if (error instanceof ValidationError) {
        throw error;
      }

      return {
        success: false,
        data: {
          paradero: codsimt,
          totalServicios: 0,
          arrivals: [],
          analisis: {
            busesLlegando: 0,
            busesProximos: 0,
            servicioMasRapido: null,
            tiempoPromedioEspera: "0 minutos",
          },
          resumen: "Error obteniendo arrivals",
        },
        timestamp: Date.now(),
        error:
          error instanceof Error ? error.message : "Error interno del servidor",
      };
    }
  }

  /**
   * Obtiene estadísticas de un paradero con múltiples muestras
   */
  async getStopStatistics(
    codsimt: string,
    samples: number = 5,
    intervalMs: number = 10000,
  ): Promise<
    ApiResponse<{
      paradero: string;
      totalMuestras: number;
      intervaloSegundos: number;
      serviciosDetectados: string[];
      estadisticas: {
        serviciosMasComunes: Array<{ servicio: string; frecuencia: number }>;
        promedioServiciosPorMuestra: number;
        totalBusesDetectados: number;
      };
      historico: Array<{
        timestamp: number;
        totalServicios: number;
        servicios: string[];
      }>;
      resumen: string;
    }>
  > {
    const cleanCode = validateAndCleanStopCode(codsimt);
    const historico: Array<{
      timestamp: number;
      totalServicios: number;
      servicios: string[];
    }> = [];

    const serviciosContador: { [key: string]: number } = {};
    const todosLosServicios = new Set<string>();

    try {
      console.log(
        `📊 Recolectando estadísticas para ${cleanCode} (${samples} muestras)`,
      );

      // Recopilar múltiples muestras
      for (let i = 0; i < samples; i++) {
        try {
          const result = await this.getArrivals(cleanCode);

          if (result.success) {
            const servicios = result.data.map((a) => a.servicio);
            const timestamp = Date.now();

            historico.push({
              timestamp,
              totalServicios: servicios.length,
              servicios: [...new Set(servicios)],
            });

            // Contar servicios
            servicios.forEach((servicio) => {
              serviciosContador[servicio] =
                (serviciosContador[servicio] || 0) + 1;
              todosLosServicios.add(servicio);
            });
          }

          // Esperar antes de la siguiente muestra (excepto en la última)
          if (i < samples - 1) {
            await new Promise((resolve) => setTimeout(resolve, intervalMs));
          }
        } catch (error) {
          console.warn(
            `⚠️ Error en muestra ${i + 1} para ${cleanCode}:`,
            error,
          );
        }
      }

      // Procesar estadísticas
      const serviciosMasComunes = Object.entries(serviciosContador)
        .map(([servicio, frecuencia]) => ({ servicio, frecuencia }))
        .sort((a, b) => b.frecuencia - a.frecuencia);

      const totalBusesDetectados = historico.reduce(
        (total, muestra) => total + muestra.totalServicios,
        0,
      );
      const promedioServiciosPorMuestra =
        historico.length > 0
          ? Math.round((totalBusesDetectados / historico.length) * 10) / 10
          : 0;

      const resumen = `Paradero ${cleanCode}: ${todosLosServicios.size} servicios únicos detectados en ${samples} muestras. Promedio: ${promedioServiciosPorMuestra} arrivals por consulta.`;

      return {
        success: true,
        data: {
          paradero: cleanCode,
          totalMuestras: historico.length,
          intervaloSegundos: Math.round(intervalMs / 1000),
          serviciosDetectados: [...todosLosServicios].sort(),
          estadisticas: {
            serviciosMasComunes,
            promedioServiciosPorMuestra,
            totalBusesDetectados,
          },
          historico,
          resumen,
        },
        timestamp: Date.now(),
      };
    } catch (error) {
      console.error(`❌ Error obteniendo estadísticas para ${codsimt}:`, error);

      if (error instanceof ValidationError) {
        throw error;
      }

      return {
        success: false,
        data: {
          paradero: cleanCode,
          totalMuestras: 0,
          intervaloSegundos: Math.round(intervalMs / 1000),
          serviciosDetectados: [],
          estadisticas: {
            serviciosMasComunes: [],
            promedioServiciosPorMuestra: 0,
            totalBusesDetectados: 0,
          },
          historico: [],
          resumen: "Error recopilando estadísticas",
        },
        timestamp: Date.now(),
        error:
          error instanceof Error ? error.message : "Error interno del servidor",
      };
    }
  }

  /**
   * Extrae minutos de un string de tiempo
   */
  private extractMinutesFromTime(timeString: string): number {
    if (timeString.includes(":")) {
      const parts = timeString.split(":");
      return parseInt(parts[1]) || 0;
    }

    // Si es solo un número, asumimos que son minutos
    const match = timeString.match(/\d+/);
    return match ? parseInt(match[0]) : 0;
  }
}

// Exportar instancia única
export const stopService = new StopService();
