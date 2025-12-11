import axios, { AxiosRequestConfig } from 'axios';
import { RedApiStopResponse, RedApiRouteResponse, JWTCache, RedClientError, AppConfig } from '../types';

export class RedClient {
  private jwtCache: JWTCache = {
    token: '',
    expiry: 0
  };

  private config: AppConfig;

  constructor() {
    this.config = {
      port: parseInt(process.env.PORT || '3000'),
      host: process.env.HOST || 'localhost',
      nodeEnv: process.env.NODE_ENV || 'development',
      allowedOrigins: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : ['*'],
      redBaseUrl: 'https://www.red.cl',
      predictorEndpoint: '/predictorPlus/prediccion',
      routeEndpoint: '/restservice_v2/rest/conocerecorrido',
      jwtCacheTime: 5 * 60 * 1000, // 5 minutos
      requestTimeout: 10000 // 10 segundos
    };
  }

  /**
   * Obtiene los arrivals de un paradero específico
   */
  async getStopArrivals(codsimt: string): Promise<RedApiStopResponse> {
    await this.refreshJwtIfNeeded();

    const url = `${this.config.redBaseUrl}${this.config.predictorEndpoint}`;
    const params = {
      t: this.jwtCache.token,
      codsimt: codsimt,
      codser: ''
    };

    try {
      const requestConfig: AxiosRequestConfig = {
        timeout: this.config.requestTimeout,
        headers: {
          'User-Agent': this.getUserAgent(),
          'Referer': 'https://www.red.cl/planifica-tu-viaje/cuando-llega/',
          'Accept': 'application/json, text/plain, */*',
          'Accept-Language': 'es-CL,es;q=0.9,en;q=0.8',
          'Accept-Encoding': 'gzip, deflate, br'
        },
        params
      };

      console.log(`🚍 Consultando arrivals para paradero: ${codsimt}`);
      const { data } = await axios.get(url, requestConfig);

      return data;
    } catch (error) {
      console.error(`❌ Error obteniendo arrivals para ${codsimt}:`, error);
      throw new RedClientError(
        `No se pudo obtener información de arrivals para el paradero ${codsimt}`,
        500
      );
    }
  }

  /**
   * Obtiene información del recorrido de un servicio
   */
  async getRoute(codser: string): Promise<RedApiRouteResponse> {
    const url = `${this.config.redBaseUrl}${this.config.routeEndpoint}`;

    try {
      const requestConfig: AxiosRequestConfig = {
        timeout: this.config.requestTimeout,
        headers: {
          'User-Agent': this.getUserAgent(),
          'Accept': 'application/json, text/plain, */*',
          'Accept-Language': 'es-CL,es;q=0.9,en;q=0.8',
          'Accept-Encoding': 'gzip, deflate, br'
        },
        params: {
          codsint: codser
        }
      };

      console.log(`🛣️ Consultando recorrido para servicio: ${codser}`);
      const { data } = await axios.get(url, requestConfig);

      return data;
    } catch (error) {
      console.error(`❌ Error obteniendo recorrido para ${codser}:`, error);
      throw new RedClientError(
        `No se pudo obtener información del recorrido para el servicio ${codser}`,
        500
      );
    }
  }

  /**
   * Refresca el JWT token si es necesario
   */
  private async refreshJwtIfNeeded(): Promise<void> {
    // Si el token aún es válido, no lo refrescamos
    if (this.jwtCache.token && Date.now() < this.jwtCache.expiry) {
      return;
    }

    try {
      const pageUrl = `${this.config.redBaseUrl}/planifica-tu-viaje/cuando-llega/?codsimt=PC205`;

      const requestConfig: AxiosRequestConfig = {
        timeout: this.config.requestTimeout,
        headers: {
          'User-Agent': this.getUserAgent(),
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'es-CL,es;q=0.9,en;q=0.8',
          'Accept-Encoding': 'gzip, deflate, br',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
      };

      console.log('🔑 Refrescando JWT token...');
      const { data: html } = await axios.get(pageUrl, requestConfig);

      // Buscar el token JWT en el HTML usando múltiples patrones
      const jwtPatterns = [
        /\$jwt\s*=\s*'([^']+)'/,
        /jwt\s*:\s*'([^']+)'/,
        /token\s*:\s*'([^']+)'/,
        /"jwt"\s*:\s*"([^"]+)"/
      ];

      let jwtMatch: RegExpMatchArray | null = null;

      for (const pattern of jwtPatterns) {
        jwtMatch = html.match(pattern);
        if (jwtMatch) {
          break;
        }
      }

      if (jwtMatch && jwtMatch[1]) {
        try {
          // Decodificar el token base64
          this.jwtCache.token = Buffer.from(jwtMatch[1], 'base64').toString('utf-8');
          this.jwtCache.expiry = Date.now() + this.config.jwtCacheTime;

          console.log('✅ JWT token refrescado exitosamente');
        } catch (decodeError) {
          // Si no se puede decodificar como base64, usar el token tal como está
          this.jwtCache.token = jwtMatch[1];
          this.jwtCache.expiry = Date.now() + this.config.jwtCacheTime;

          console.log('✅ JWT token obtenido exitosamente (sin decodificar)');
        }
      } else {
        throw new Error('No se pudo extraer el token JWT del HTML');
      }
    } catch (error) {
      console.error('❌ Error al refrescar JWT:', error);
      throw new RedClientError('No se pudo obtener token de autenticación', 503);
    }
  }

  /**
   * Genera un User-Agent realista para las requests
   */
  private getUserAgent(): string {
    const userAgents = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    ];

    return userAgents[Math.floor(Math.random() * userAgents.length)];
  }

  /**
   * Invalida el cache del JWT token (útil para testing)
   */
  public invalidateJwtCache(): void {
    this.jwtCache.token = '';
    this.jwtCache.expiry = 0;
    console.log('🗑️ Cache de JWT token invalidado');
  }

  /**
   * Obtiene información sobre el estado del cache JWT
   */
  public getJwtCacheInfo(): { hasToken: boolean; expiresIn: number; isValid: boolean } {
    const now = Date.now();
    const expiresIn = Math.max(0, this.jwtCache.expiry - now);

    return {
      hasToken: Boolean(this.jwtCache.token),
      expiresIn: Math.floor(expiresIn / 1000), // en segundos
      isValid: Boolean(this.jwtCache.token && now < this.jwtCache.expiry)
    };
  }

  /**
   * Obtiene configuración actual del cliente
   */
  public getConfig(): Readonly<AppConfig> {
    return Object.freeze({ ...this.config });
  }
}

// Instancia singleton del cliente
export const redClient = new RedClient();
