export interface RedStopArrival {
  servicio: string;
  destino: string;
  distanciabus1: string;
  horaprediccionbus1: string;
  ppubus1: string;
  distanciabus2?: string;
  horaprediccionbus2?: string;
  ppubus2?: string;
}

export interface RedRoute {
  destino: string;
  paraderos: Array<{
    cod: string;
    name: string;
    comuna: string;
    pos: [number, number]; // [lat, lon]
  }>;
  path: Array<[number, number]>; // [lon, lat]
  horarios: Array<{ tipoDia: string; inicio: string; fin: string }>;
  itinerario: boolean;
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  timestamp: number;
  error?: string;
}

// Tipos internos para respuestas de Red.cl
export interface RedApiStopResponse {
  servicios?: {
    item?: Array<{
      codigorespuesta: string;
      servicio: string;
      destino: string;
      distanciabus1: string;
      horaprediccionbus1: string;
      ppubus1: string;
      distanciabus2?: string;
      horaprediccionbus2?: string;
      ppubus2?: string;
    }>;
  };
}

export interface RedApiRouteResponse {
  ida?: {
    destino: string;
    paraderos: Array<{
      cod: string;
      name: string;
      comuna: string;
      pos: [number, number];
    }>;
    path: Array<[number, number]>;
    horarios: Array<{ tipoDia: string; inicio: string; fin: string }>;
    itinerario: boolean;
  };
  regreso?: {
    destino: string;
    paraderos: Array<{
      cod: string;
      name: string;
      comuna: string;
      pos: [number, number];
    }>;
    path: Array<[number, number]>;
    horarios: Array<{ tipoDia: string; inicio: string; fin: string }>;
    itinerario: boolean;
  };
}

// Tipos para responses formateados
export interface FormattedArrival {
  servicio: string;
  destino: string;
  buses: Array<{
    distancia: string;
    tiempo: string;
    patente: string;
  }>;
}

export interface FormattedRoute {
  destino: string;
  totalParaderos: number;
  paraderos: Array<{
    codigo: string;
    nombre: string;
    comuna: string;
    ubicacion: {
      latitud: number;
      longitud: number;
    };
  }>;
  recorrido: {
    puntos: number;
    coordenadas: Array<{
      longitud: number;
      latitud: number;
    }>;
  };
  horarios: Array<{
    tipo: string;
    inicio: string;
    fin: string;
  }>;
  tieneItinerario: boolean;
}

// Tipos para validaciones
export interface ValidationResult {
  valid: boolean;
  error?: string;
}

// Tipos para rate limiting
export interface RateLimitConfig {
  windowMs: number;
  max: number;
  message: {
    error: string;
    retryAfter: number;
  };
  standardHeaders: boolean;
  legacyHeaders: boolean;
}

// Tipos para health check
export interface HealthCheckResponse {
  status: string;
  service: string;
  version: string;
  timestamp: number;
  uptime: number;
  memory: NodeJS.MemoryUsage;
  endpoints: {
    arrivals: string;
    arrivalsFormatted: string;
    route: string;
    routeFormatted: string;
    fullRoute: string;
    routeStops: string;
  };
}

// Tipos para documentación
export interface APIDocumentation {
  message: string;
  version: string;
  description: string;
  documentation: {
    health: string;
    arrivals: {
      basic: string;
      byService: string;
      formatted: string;
    };
    routes: {
      basic: string;
      formatted: string;
      full: string;
      stops: string;
    };
  };
  examples: Record<string, string>;
  limits: {
    arrivals: string;
    routes: string;
    general: string;
  };
  github?: string;
}

// Tipos para configuración
export interface AppConfig {
  port: number;
  host: string;
  nodeEnv: string;
  allowedOrigins: string[];
  redBaseUrl: string;
  predictorEndpoint: string;
  routeEndpoint: string;
  jwtCacheTime: number;
  requestTimeout: number;
}

// Tipos para JWT
export interface JWTCache {
  token: string;
  expiry: number;
}

// Tipos para errores personalizados
export class RedClientError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
  ) {
    super(message);
    this.name = "RedClientError";
  }
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

// Tipos para Express request con parámetros tipados
export interface StopRequest {
  codsimt: string;
}

export interface RouteRequest {
  codser: string;
}
