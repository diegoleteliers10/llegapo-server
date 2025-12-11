import { RedStopArrival, RedRoute, FormattedArrival, FormattedRoute } from '../types';

/**
 * Formatea los arrivals para una mejor legibilidad
 */
export function formatArrivals(arrivals: RedStopArrival[]): FormattedArrival[] {
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
              tiempo: arrival.horaprediccionbus2 || '',
              patente: arrival.ppubus2 || '',
            },
          ]
        : []),
    ].filter((bus) => bus.distancia && bus.tiempo),
  }));
}

/**
 * Formatea la información del recorrido para mejor legibilidad
 */
export function formatRoute(route: RedRoute): FormattedRoute {
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

/**
 * Formatea solo los paraderos de un recorrido
 */
export function formatRouteStops(route: RedRoute) {
  return route.paraderos.map((p) => ({
    codigo: p.cod,
    nombre: p.name,
    comuna: p.comuna,
    ubicacion: {
      latitud: p.pos[0],
      longitud: p.pos[1],
    },
  }));
}

/**
 * Formatea el tiempo de arrival para mostrar de manera más amigable
 */
export function formatArrivalTime(distancia: string, tiempo: string): string {
  if (!distancia || !tiempo) {
    return 'Sin información';
  }

  // Si la distancia indica "Llegando", mostrar eso
  if (distancia.toLowerCase().includes('llegando')) {
    return 'Llegando ahora';
  }

  // Si tiene minutos, formatear
  if (distancia.includes('min')) {
    const minutos = parseInt(distancia);
    if (!isNaN(minutos)) {
      if (minutos <= 1) {
        return 'Menos de 1 minuto';
      } else if (minutos <= 5) {
        return `${minutos} minutos (próximo)`;
      } else {
        return `${minutos} minutos`;
      }
    }
  }

  // Si tiene metros, formatear
  if (distancia.includes('m') && !distancia.includes('min')) {
    const metros = parseInt(distancia);
    if (!isNaN(metros)) {
      if (metros <= 100) {
        return 'Muy cerca (< 100m)';
      } else if (metros <= 500) {
        return 'Cerca (< 500m)';
      } else {
        return `${metros}m de distancia`;
      }
    }
  }

  // Fallback: devolver la información original
  return `${distancia} - ${tiempo}`;
}

/**
 * Formatea los horarios de manera más legible
 */
export function formatSchedule(horarios: Array<{ tipoDia: string; inicio: string; fin: string }>) {
  const scheduleMap: Record<string, string> = {
    'LV': 'Lunes a Viernes',
    'S': 'Sábados',
    'D': 'Domingos',
    'LF': 'Lunes a Viernes',
    'SA': 'Sábados',
    'DO': 'Domingos',
    'L-V': 'Lunes a Viernes',
    'L-D': 'Lunes a Domingo',
  };

  return horarios.map((horario) => ({
    dia: scheduleMap[horario.tipoDia] || horario.tipoDia,
    horario: `${horario.inicio} - ${horario.fin}`,
    inicio: horario.inicio,
    fin: horario.fin,
  }));
}

/**
 * Formatea la distancia de manera más amigable
 */
export function formatDistance(distancia: string): string {
  if (!distancia) {
    return 'Sin información';
  }

  const dist = distancia.toLowerCase().trim();

  // Casos especiales
  if (dist.includes('llegando')) {
    return 'Llegando';
  }

  if (dist.includes('en paradero') || dist.includes('detenido')) {
    return 'En paradero';
  }

  // Formatear minutos
  const minutosMatch = dist.match(/(\d+)\s*min/);
  if (minutosMatch) {
    const minutos = parseInt(minutosMatch[1]);
    if (minutos <= 1) {
      return 'Menos de 1 min';
    }
    return `${minutos} min`;
  }

  // Formatear metros
  const metrosMatch = dist.match(/(\d+)\s*m/);
  if (metrosMatch) {
    const metros = parseInt(metrosMatch[1]);
    if (metros < 1000) {
      return `${metros}m`;
    }
    return `${(metros / 1000).toFixed(1)}km`;
  }

  // Formatear kilómetros
  const kmMatch = dist.match(/(\d+\.?\d*)\s*km/);
  if (kmMatch) {
    const km = parseFloat(kmMatch[1]);
    return `${km}km`;
  }

  // Devolver original si no se puede formatear
  return distancia;
}

/**
 * Formatea el tiempo en formato más legible
 */
export function formatTime(tiempo: string): string {
  if (!tiempo) {
    return 'Sin información';
  }

  // Si ya está en formato HH:MM, validar y devolver
  if (tiempo.match(/^\d{2}:\d{2}$/)) {
    return tiempo;
  }

  // Si está en formato H:MM, agregar cero
  if (tiempo.match(/^\d{1}:\d{2}$/)) {
    return `0${tiempo}`;
  }

  // Otros formatos, devolver original
  return tiempo;
}

/**
 * Formatea el nombre de la comuna
 */
export function formatComuna(comuna: string): string {
  if (!comuna) {
    return 'Comuna no especificada';
  }

  // Capitalizar primera letra de cada palabra
  return comuna
    .toLowerCase()
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Formatea el nombre del paradero
 */
export function formatStopName(nombre: string): string {
  if (!nombre) {
    return 'Paradero sin nombre';
  }

  // Limpiar y formatear
  return nombre
    .trim()
    .replace(/\s+/g, ' ') // Remover espacios múltiples
    .replace(/\b\w/g, (char) => char.toUpperCase()); // Capitalizar primera letra de cada palabra
}

/**
 * Genera un resumen de arrivals
 */
export function generateArrivalsSummary(arrivals: RedStopArrival[]): string {
  if (arrivals.length === 0) {
    return 'No hay servicios disponibles en este momento';
  }

  const servicios = arrivals.map((a) => a.servicio).join(', ');
  const proximosLlegando = arrivals.filter((a) =>
    a.distanciabus1.toLowerCase().includes('llegando')
  ).length;

  let summary = `${arrivals.length} servicio${arrivals.length > 1 ? 's' : ''} disponible${arrivals.length > 1 ? 's' : ''}: ${servicios}`;

  if (proximosLlegando > 0) {
    summary += `. ${proximosLlegando} bus${proximosLlegando > 1 ? 'es' : ''} llegando ahora`;
  }

  return summary;
}

/**
 * Formatea las coordenadas para mostrar en formato legible
 */
export function formatCoordinates(lat: number, lon: number): string {
  if (isNaN(lat) || isNaN(lon)) {
    return 'Coordenadas no válidas';
  }

  return `${lat.toFixed(6)}, ${lon.toFixed(6)}`;
}

/**
 * Formatea el uptime del servidor
 */
export function formatUptime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}h ${minutes}m ${secs}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  } else {
    return `${secs}s`;
  }
}

/**
 * Formatea el uso de memoria
 */
export function formatMemoryUsage(bytes: number): string {
  const mb = bytes / 1024 / 1024;
  return `${mb.toFixed(1)} MB`;
}
