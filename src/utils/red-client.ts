import axios, { AxiosRequestConfig } from "axios";
import {
  RedApiStopResponse,
  RedApiRouteResponse,
  JWTCache,
  RedClientError,
  AppConfig,
} from "../types";

export class RedClient {
  private jwtCache: JWTCache = {
    token: "",
    expiry: 0,
  };

  private config: AppConfig;

  constructor() {
    this.config = {
      port: parseInt(process.env.PORT || "3000"),
      host: process.env.HOST || "localhost",
      nodeEnv: process.env.NODE_ENV || "development",
      allowedOrigins: process.env.ALLOWED_ORIGINS
        ? process.env.ALLOWED_ORIGINS.split(",")
        : ["*"],
      redBaseUrl: "https://www.red.cl",
      predictorEndpoint: "/predictorPlus/prediccion",
      routeEndpoint: "/restservice_v2/rest/conocerecorrido",
      jwtCacheTime: 5 * 60 * 1000, // 5 minutos
      requestTimeout: 10000, // 10 segundos
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
      codser: "",
    };

    try {
      const requestConfig: AxiosRequestConfig = {
        timeout: this.config.requestTimeout,
        headers: {
          "User-Agent": this.getUserAgent(),
          Referer: "https://www.red.cl/planifica-tu-viaje/cuando-llega/",
          Accept: "application/json, text/plain, */*",
          "Accept-Language": "es-CL,es;q=0.9,en;q=0.8",
          "Accept-Encoding": "gzip, deflate, br",
        },
        params,
      };

      console.log(`🚍 Consultando arrivals para paradero: ${codsimt}`);
      console.log(`🔑 Token usado: ${this.jwtCache.token.substring(0, 20)}...`);
      console.log(`📡 URL: ${url}`);
      console.log(`📦 Params:`, JSON.stringify(params));

      const { data } = await axios.get(url, requestConfig);

      console.log(
        `✅ Response obtenida para ${codsimt}:`,
        typeof data,
        Object.keys(data || {}),
      );
      return data;
    } catch (error: any) {
      console.error(`❌ Error obteniendo arrivals para ${codsimt}:`, error);

      // Log detallado del error para producción
      if (error.response) {
        console.error(`📡 Status: ${error.response.status}`);
        console.error(`📦 Data:`, error.response.data);
        console.error(`🔧 Headers:`, error.response.headers);
      } else if (error.request) {
        console.error(`📡 No response received:`, error.request);
      } else {
        console.error(`⚙️ Error config:`, error.message);
      }

      throw new RedClientError(
        `No se pudo obtener información de arrivals para el paradero ${codsimt}: ${error.message}`,
        500,
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
          "User-Agent": this.getUserAgent(),
          Accept: "application/json, text/plain, */*",
          "Accept-Language": "es-CL,es;q=0.9,en;q=0.8",
          "Accept-Encoding": "gzip, deflate, br",
        },
        params: {
          codsint: codser,
        },
      };

      console.log(`🛣️ Consultando recorrido para servicio: ${codser}`);
      const { data } = await axios.get(url, requestConfig);

      return data;
    } catch (error: any) {
      console.error(`❌ Error obteniendo recorrido para ${codser}:`, error);
      throw new RedClientError(
        `No se pudo obtener información del recorrido para el servicio ${codser}`,
        500,
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

    console.log("🔑 Refrescando JWT token...");
    console.log(`🌍 Entorno: ${this.config.nodeEnv}`);
    console.log(
      `⏰ Token expiró: ${new Date(this.jwtCache.expiry).toISOString()}`,
    );

    // Estrategia 1: Método original (funciona localmente)
    try {
      console.log("🎯 Intentando método original...");
      const success = await this.tryOriginalJwtMethod();
      if (success) return;
    } catch (error) {
      console.log(
        "🔄 Método original falló, intentando estrategias para Vercel...",
        error instanceof Error ? error.message : error,
      );
    }

    // Estrategia 2: Múltiples URLs para Vercel
    const vercelSuccess = await this.tryVercelStrategies();
    if (!vercelSuccess) {
      throw new RedClientError(
        "No se pudo obtener token de autenticación después de múltiples intentos",
        503,
      );
    }
  }

  /**
   * Estrategia original que funciona localmente
   */
  private async tryOriginalJwtMethod(): Promise<boolean> {
    const pageUrl = `${this.config.redBaseUrl}/planifica-tu-viaje/cuando-llega/?codsimt=PC205`;

    const requestConfig: AxiosRequestConfig = {
      timeout: this.config.requestTimeout,
      headers: {
        "User-Agent": this.getUserAgent(),
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "es-CL,es;q=0.9,en;q=0.8",
        "Accept-Encoding": "gzip, deflate, br",
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
      },
    };

    console.log(`📡 Requesting: ${pageUrl}`);
    const { data: html } = await axios.get(pageUrl, requestConfig);

    console.log(`📄 HTML recibido: ${html ? html.length : 0} caracteres`);
    console.log(`📄 Preview: ${html ? html.substring(0, 200) : "No HTML"}...`);

    return this.extractAndSetJwt(html, "método original");
  }

  /**
   * Estrategias específicas para Vercel
   */
  private async tryVercelStrategies(): Promise<boolean> {
    const strategies = [
      {
        name: "Home page",
        url: `${this.config.redBaseUrl}/`,
        timeout: 15000,
      },
      {
        name: "Planifica tu viaje",
        url: `${this.config.redBaseUrl}/planifica-tu-viaje/`,
        timeout: 15000,
      },
      {
        name: "Cuando llega simple",
        url: `${this.config.redBaseUrl}/planifica-tu-viaje/cuando-llega/`,
        timeout: 20000,
      },
    ];

    for (const strategy of strategies) {
      try {
        console.log(`🔄 Intentando estrategia: ${strategy.name}`);

        const requestConfig: AxiosRequestConfig = {
          timeout: strategy.timeout,
          headers: {
            "User-Agent": this.getVercelOptimizedUserAgent(),
            Accept:
              "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
            "Accept-Language": "es-CL,es-419;q=0.9,es;q=0.8,en;q=0.7",
            "Accept-Encoding": "gzip, deflate, br",
            "Cache-Control": "no-cache, no-store, must-revalidate",
            Pragma: "no-cache",
            "Sec-Ch-Ua":
              '"Google Chrome";v="119", "Chromium";v="119", "Not?A_Brand";v="24"',
            "Sec-Ch-Ua-Mobile": "?0",
            "Sec-Ch-Ua-Platform": '"Linux"',
            "Sec-Fetch-Dest": "document",
            "Sec-Fetch-Mode": "navigate",
            "Sec-Fetch-Site": "none",
            "Sec-Fetch-User": "?1",
            "Upgrade-Insecure-Requests": "1",
          },
        };

        console.log(`📡 Requesting: ${strategy.url}`);
        const { data: html } = await axios.get(strategy.url, requestConfig);

        console.log(
          `📄 HTML recibido en ${strategy.name}: ${html ? html.length : 0} caracteres`,
        );

        if (this.extractAndSetJwt(html, strategy.name)) {
          return true;
        }

        // Pequeña pausa entre intentos
        await new Promise((resolve) => setTimeout(resolve, 1000));
      } catch (error: any) {
        console.log(
          `❌ Estrategia ${strategy.name} falló:`,
          error instanceof Error ? error.message : error,
        );

        // Log detallado para producción
        if (error.response) {
          console.log(`📡 Status: ${error.response.status}`);
          console.log(
            `📦 Response data:`,
            error.response.data
              ? error.response.data.substring(0, 200)
              : "No data",
          );
        }
      }
    }

    return false;
  }

  /**
   * Extrae el JWT del HTML y lo configura si es válido
   */
  private extractAndSetJwt(html: string, strategy: string): boolean {
    // Verificar que tenemos HTML válido
    if (!html || typeof html !== "string" || html.length < 100) {
      console.log(`⚠️ HTML inválido en ${strategy}`);
      return false;
    }

    // Patrones de búsqueda JWT (del más específico al más general)
    const jwtPatterns = [
      /\$jwt\s*=\s*'([^']+)'/,
      /jwt\s*:\s*'([^']+)'/,
      /token\s*:\s*'([^']+)'/,
      /"jwt"\s*:\s*"([^"]+)"/,
      /var\s+jwt\s*=\s*["']([^"']+)["']/,
      /window\.jwt\s*=\s*["']([^"']+)["']/,
    ];

    for (const pattern of jwtPatterns) {
      const jwtMatch = html.match(pattern);
      if (jwtMatch && jwtMatch[1]) {
        const rawToken = jwtMatch[1];

        // Validar longitud mínima
        if (rawToken.length < 20) {
          continue;
        }

        try {
          // Intentar decodificar como base64
          this.jwtCache.token = Buffer.from(rawToken, "base64").toString(
            "utf-8",
          );
          this.jwtCache.expiry = Date.now() + this.config.jwtCacheTime;
          console.log(
            `✅ JWT token obtenido con ${strategy} (decodificado, longitud: ${this.jwtCache.token.length})`,
          );
          return true;
        } catch (decodeError) {
          // Si no se puede decodificar, usar tal como está
          this.jwtCache.token = rawToken;
          this.jwtCache.expiry = Date.now() + this.config.jwtCacheTime;
          console.log(
            `✅ JWT token obtenido con ${strategy} (sin decodificar, longitud: ${rawToken.length})`,
          );
          return true;
        }
      }
    }

    console.log(`❌ No se encontró JWT en ${strategy}`);
    console.log(`🔍 Patrones probados: ${jwtPatterns.length}`);
    console.log(`📄 HTML sample para debug:`, html.substring(0, 500));
    return false;
  }

  /**
   * User-Agent optimizado para Vercel
   */
  private getVercelOptimizedUserAgent(): string {
    // En Vercel, usar un User-Agent más estándar y menos sospechoso
    return "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36";
  }

  /**
   * Genera un User-Agent realista para las requests
   */
  private getUserAgent(): string {
    const userAgents = [
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    ];

    return userAgents[Math.floor(Math.random() * userAgents.length)];
  }

  /**
   * Invalida el cache del JWT token (útil para testing)
   */
  public invalidateJwtCache(): void {
    this.jwtCache.token = "";
    this.jwtCache.expiry = 0;
    console.log("🗑️ Cache de JWT token invalidado");
  }

  /**
   * Obtiene información sobre el estado del cache JWT
   */
  public getJwtCacheInfo(): {
    hasToken: boolean;
    expiresIn: number;
    isValid: boolean;
  } {
    const now = Date.now();
    const expiresIn = Math.max(0, this.jwtCache.expiry - now);

    return {
      hasToken: Boolean(this.jwtCache.token),
      expiresIn: Math.floor(expiresIn / 1000), // en segundos
      isValid: Boolean(this.jwtCache.token && now < this.jwtCache.expiry),
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
